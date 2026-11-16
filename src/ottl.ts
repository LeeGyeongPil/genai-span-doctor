// Generates a Collector transform-processor snippet (OTTL) that maps observed dialects to the
// standard gen_ai.usage.* names. Statement order matters: cache copies, sums, plain copies, deletes.
import type { Translator } from './i18n.js';
import type { SpanAnalysis } from './normalize.js';
import type { Rules } from './rules.js';

export interface OttlOptions {
  rules: Rules;
  t: Translator;
  version: string;
  deleteSource: boolean;
  assumeCacheExcluded: ReadonlySet<string>;
}

const attr = (key: string): string => `span.attributes["${key}"]`;
const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Keys per dialect that were actually seen on spans (so the snippet stays minimal). */
function observed(analyses: SpanAnalysis[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const a of analyses) {
    for (const [id, keys] of a.usedKeys) {
      const set = out.get(id) ?? new Set<string>();
      for (const k of keys) set.add(k);
      out.set(id, set);
    }
  }
  return out;
}

export interface OttlResult {
  yaml: string;
  statements: { phase: 'cache' | 'sum' | 'copy' | 'delete'; text: string }[];
}

export function generateOttl(analyses: SpanAnalysis[], o: OttlOptions): OttlResult {
  const std = o.rules.dialects.standard;
  const seen = observed(analyses);
  const statements: OttlResult['statements'] = [];
  const add = (phase: OttlResult['statements'][number]['phase'], text: string): void => {
    if (!statements.some((s) => s.text === text)) statements.push({ phase, text });
  };

  const dialects = o.rules.dialects.priority
    .map((id) => o.rules.dialects.dialects.find((d) => d.id === id)!)
    .filter((d) => d.id !== 'otel-genai' && seen.has(d.id));

  // Step 1: cache attributes -> standard names, so the sums below can rely on the standard names.
  for (const d of dialects) {
    const keys = seen.get(d.id)!;
    for (const [field, target] of [['cacheRead', std.cacheRead], ['cacheWrite', std.cacheWrite]] as const) {
      for (const k of d.keys[field]) {
        if (!keys.has(k) || k === target) continue;
        add('cache', `set(${attr(target)}, ${attr(k)}) where ${attr(target)} == nil and ${attr(k)} != nil`);
      }
    }
  }

  // Step 2: input sums. Cache-excluding dialects always add the cache; others only when cache > input.
  for (const d of dialects) {
    const keys = seen.get(d.id)!;
    const hasRead = d.keys.cacheRead.some((k) => keys.has(k));
    const hasWrite = d.keys.cacheWrite.some((k) => keys.has(k));
    if (!hasRead && !hasWrite) continue;
    const always = o.assumeCacheExcluded.has(d.id) || d.inputIncludesCache === false;
    const inputKeys = d.keys.input.length > 0 ? d.keys.input.filter((k) => keys.has(k)) : [std.input];
    const inPlace = d.keys.input.length === 0;
    for (const k of inputKeys) {
      const target = attr(std.input);
      const source = attr(k);
      const cr = attr(std.cacheRead);
      const cw = attr(std.cacheWrite);
      const head = inPlace ? `${source} != nil` : `${target} == nil and ${source} != nil`;
      const variants: { guard: string; expr: string; cond: string }[] = [];
      if (hasRead && hasWrite) variants.push({ guard: `${cr} != nil and ${cw} != nil`, expr: `${source} + ${cr} + ${cw}`, cond: `(${cr} + ${cw}) > ${source}` });
      if (hasRead) variants.push({ guard: `${cr} != nil and ${cw} == nil`, expr: `${source} + ${cr}`, cond: `${cr} > ${source}` });
      if (hasWrite) variants.push({ guard: `${cw} != nil and ${cr} == nil`, expr: `${source} + ${cw}`, cond: `${cw} > ${source}` });
      for (const v of variants) {
        // The cache-inclusive dialects are corrected only when the cache total exceeds the input.
        const where = always ? `${head} and ${v.guard}` : `${head} and ${v.guard} and ${v.cond}`;
        add('sum', `set(${target}, ${v.expr}) where ${where}`);
      }
    }
  }

  // Step 3: plain copies of input and output.
  for (const d of dialects) {
    const keys = seen.get(d.id)!;
    for (const [field, target] of [['input', std.input], ['output', std.output]] as const) {
      for (const k of d.keys[field]) {
        if (!keys.has(k) || k === target) continue;
        add('copy', `set(${attr(target)}, ${attr(k)}) where ${attr(target)} == nil and ${attr(k)} != nil`);
      }
    }
  }

  // Step 4 (optional): remove the source attributes after everything has been copied.
  if (o.deleteSource) {
    const standardKeys = new Set(Object.values(std));
    for (const d of dialects) {
      const keys = seen.get(d.id)!;
      for (const k of keys) if (!standardKeys.has(k)) add('delete', `delete_key(span.attributes, "${k}")`);
    }
  }

  const { t } = o;
  const lines: string[] = [`# ${t('ottl.header', { version: o.version })}`, 'processors:', '  transform/genai:', '    error_mode: ignore', '    trace_statements:'];
  const phases: Array<[OttlResult['statements'][number]['phase'], Parameters<Translator>[0]]> = [
    ['cache', 'ottl.phase.cache'],
    ['sum', 'ottl.phase.sum'],
    ['copy', 'ottl.phase.copy'],
    ['delete', 'ottl.phase.delete'],
  ];
  for (const [phase, key] of phases) {
    const group = statements.filter((s) => s.phase === phase);
    if (group.length === 0) continue;
    lines.push(`      # ${t(key)}`);
    for (const s of group) lines.push(`      - ${q(s.text)}`);
  }
  // Keep the output order equal to the phase order.
  const ordered = phases.flatMap(([phase]) => statements.filter((s) => s.phase === phase));
  return { yaml: lines.join('\n') + '\n', statements: ordered };
}
