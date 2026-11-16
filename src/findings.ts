// Findings GSD001-GSD006. Rule ids double as SARIF rule ids.
import type { Translator } from './i18n.js';
import { normalizedInputOf, type SpanAnalysis } from './normalize.js';
import type { Backend, Rules } from './rules.js';

export type Level = 'error' | 'warning' | 'note';
export const LEVEL_ORDER: Record<Level, number> = { note: 1, warning: 2, error: 3 };

export const RULE_IDS = ['GSD001', 'GSD002', 'GSD003', 'GSD004', 'GSD005', 'GSD006'] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const RULE_LEVEL: Record<RuleId, Level> = {
  GSD001: 'error',
  GSD002: 'warning',
  GSD003: 'error',
  GSD004: 'warning',
  GSD005: 'warning',
  GSD006: 'note',
};

export interface Finding {
  ruleId: RuleId;
  level: Level;
  file: string;
  traceId: string;
  spanId: string;
  spanName: string;
  message: string;
}

export interface FindingContext {
  rules: Rules;
  backendName: string;
  backend: Backend;
  assumeCacheExcluded: ReadonlySet<string>;
  t: Translator;
}

function make(a: SpanAnalysis, ruleId: RuleId, message: string): Finding {
  return {
    ruleId,
    level: RULE_LEVEL[ruleId],
    file: a.span.file,
    traceId: a.span.traceId,
    spanId: a.span.spanId,
    spanName: a.span.name,
    message,
  };
}

function spanFindings(a: SpanAnalysis, ctx: FindingContext): Finding[] {
  const { t } = ctx;
  const out: Finding[] = [];
  const m = a.matches;

  // GSD001: something the backend should show is present on the span but not under a name the backend reads.
  const hasInput = a.rawInput !== undefined;
  const hasOutput = a.rawOutput !== undefined;
  const missingInput = hasInput && a.backend.input === undefined;
  const missingOutput = hasOutput && a.backend.output === undefined;
  if (missingInput || missingOutput) {
    const what = missingInput && missingOutput ? 'both' : missingInput ? 'input' : 'output';
    const found = m.flatMap((x) => [x.input?.key, x.output?.key]).filter((k): k is string => !!k);
    const expected = missingInput && missingOutput ? [ctx.backend.input.join(' | '), ctx.backend.output.join(' | ')].join(' / ') : (missingInput ? ctx.backend.input : ctx.backend.output).join(', ');
    out.push(
      make(a, 'GSD001', t('finding.GSD001', {
        backend: ctx.backendName,
        what: t(`finding.GSD001.${what}` as 'finding.GSD001.both'),
        found: found.join(', '),
        expected,
      })),
    );
  }

  // GSD002: deprecated attribute names.
  if (a.deprecated.length > 0) {
    out.push(make(a, 'GSD002', t('finding.GSD002', { list: a.deprecated.map((d) => `${d.key} -> ${d.replacement}`).join(', ') })));
  }

  // GSD003: cache larger than input although input should include cache.
  if (a.cacheSuspect) {
    out.push(
      make(a, 'GSD003', t('finding.GSD003', {
        cache: a.normalized.cacheRead + a.normalized.cacheWrite,
        input: a.rawInput ?? 0,
        dialect: a.primary,
        normalized: a.normalized.input,
      })),
    );
  }

  // GSD004: two dialects give different values after normalization.
  const cacheSum = a.normalized.cacheRead + a.normalized.cacheWrite;
  const withInput = m.filter((x) => x.input);
  const baseIn = withInput[0];
  if (baseIn) {
    const baseValue = normalizedInputOf(baseIn, cacheSum, ctx.assumeCacheExcluded);
    for (const other of withInput.slice(1)) {
      const v = normalizedInputOf(other, cacheSum, ctx.assumeCacheExcluded);
      if (v !== baseValue) {
        out.push(make(a, 'GSD004', t('finding.GSD004', { what: t('finding.GSD004.input'), a: `${baseIn.id} (${baseIn.input?.key})`, va: baseValue ?? 0, b: `${other.id} (${other.input?.key})`, vb: v ?? 0 })));
        break;
      }
    }
  }
  const withOutput = m.filter((x) => x.output);
  const baseOut = withOutput[0];
  if (baseOut) {
    for (const other of withOutput.slice(1)) {
      if (other.output?.value !== baseOut.output?.value) {
        out.push(make(a, 'GSD004', t('finding.GSD004', { what: t('finding.GSD004.output'), a: `${baseOut.id} (${baseOut.output?.key})`, va: baseOut.output?.value ?? 0, b: `${other.id} (${other.output?.key})`, vb: other.output?.value ?? 0 })));
        break;
      }
    }
  }

  // GSD005: reported total does not match input + output (raw or normalized).
  for (const x of m) {
    if (!x.total) continue;
    const rawIn = x.input?.value ?? a.rawInput ?? 0;
    const rawOut = x.output?.value ?? a.rawOutput ?? 0;
    const sum = rawIn + rawOut;
    const nsum = a.normalized.input + a.normalized.output;
    if (x.total.value !== sum && x.total.value !== nsum) {
      out.push(make(a, 'GSD005', t('finding.GSD005', { total: x.total.value, key: x.total.key, sum, nsum })));
      break;
    }
  }
  return out;
}

/** Evaluates all rules. GSD006 is reported once per file with a file-level (span-less) location. */
export function evaluate(analyses: SpanAnalysis[], ctx: FindingContext): Finding[] {
  const findings: Finding[] = [];
  for (const a of analyses) findings.push(...spanFindings(a, ctx));

  const byFile = new Map<string, Set<string>>();
  for (const a of analyses) {
    const set = byFile.get(a.span.file) ?? new Set<string>();
    set.add(a.primary);
    byFile.set(a.span.file, set);
  }
  for (const [file, set] of byFile) {
    if (set.size < 2) continue;
    findings.push({
      ruleId: 'GSD006',
      level: RULE_LEVEL.GSD006,
      file,
      traceId: '',
      spanId: '',
      spanName: '',
      message: ctx.t('finding.GSD006', { count: set.size, list: [...set].join(', ') }),
    });
  }
  return findings;
}
