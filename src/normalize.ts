// Normalization: convert the usage on one span to the spec meaning
// (input includes cache read and cache write tokens) and record what the chosen backend can read.
import { detectDialects, firstNumber, firstString, type DialectMatch } from './detect.js';
import type { SpanRecord } from './otlp.js';
import type { Backend, DeprecatedAttribute, Field, Rules } from './rules.js';

export interface AnalyzeOptions {
  backend: Backend;
  /** Dialect ids whose input is forced to exclude cache tokens. */
  assumeCacheExcluded: ReadonlySet<string>;
}

export interface BackendView {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface SpanAnalysis {
  span: SpanRecord;
  model?: string;
  provider?: string;
  /** All matched dialect ids in priority order. */
  dialects: string[];
  matches: DialectMatch[];
  /** Dialect that supplied the input value (or the first match when there is no input). */
  primary: string;
  inputIncludesCache: boolean;
  /** True when cache tokens exceed the input although the dialect says input includes cache. */
  cacheSuspect: boolean;
  rawInput?: number;
  rawOutput?: number;
  normalized: { input: number; output: number; cacheRead: number; cacheWrite: number };
  backend: BackendView;
  /** Usage attribute keys present on the span, grouped by dialect id (used for OTTL generation). */
  usedKeys: Map<string, Set<string>>;
  deprecated: DeprecatedAttribute[];
}

/** Picks the first defined value per field following dialect priority. */
function resolve(matches: DialectMatch[], field: 'input' | 'output' | 'cacheRead' | 'cacheWrite') {
  for (const m of matches) {
    const v = m[field];
    if (v) return { dialectId: m.id, ...v };
  }
  return undefined;
}

function backendNumber(span: SpanRecord, keys: string[]): number | undefined {
  return firstNumber(span, keys)?.value;
}

/** Normalized input of a single dialect, used to compare dialects with each other (GSD004). */
export function normalizedInputOf(m: DialectMatch, fallbackCache: number, assume: ReadonlySet<string>): number | undefined {
  if (!m.input) return undefined;
  const hasOwnCache = m.cacheRead !== undefined || m.cacheWrite !== undefined;
  const cache = hasOwnCache ? (m.cacheRead?.value ?? 0) + (m.cacheWrite?.value ?? 0) : fallbackCache;
  const includes = assume.has(m.id) ? false : m.dialect.inputIncludesCache;
  if (includes === false) return m.input.value + cache;
  return cache > m.input.value ? m.input.value + cache : m.input.value;
}

export function analyzeSpan(span: SpanRecord, rules: Rules, opts: AnalyzeOptions): SpanAnalysis | undefined {
  const matches = detectDialects(span, rules);
  if (matches.length === 0) return undefined;

  const input = resolve(matches, 'input');
  const output = resolve(matches, 'output');
  const cr = resolve(matches, 'cacheRead');
  const cw = resolve(matches, 'cacheWrite');
  const cacheSum = (cr?.value ?? 0) + (cw?.value ?? 0);

  const primaryMatch = matches.find((m) => m.id === input?.dialectId) ?? matches[0]!;
  const forced = opts.assumeCacheExcluded.has(primaryMatch.id);
  const table = primaryMatch.dialect.inputIncludesCache;
  const excludesByTable = forced || table === false;

  let normalizedInput = 0;
  let cacheSuspect = false;
  if (input) {
    if (excludesByTable) {
      normalizedInput = input.value + cacheSum;
    } else if (cacheSum > input.value) {
      cacheSuspect = true;
      normalizedInput = input.value + cacheSum;
    } else {
      normalizedInput = input.value;
    }
  }

  const usedKeys = new Map<string, Set<string>>();
  const fields: Field[] = ['input', 'output', 'cacheRead', 'cacheWrite'];
  for (const m of matches) {
    const set = new Set<string>();
    for (const f of fields) {
      for (const k of m.dialect.keys[f]) if (span.attrs.has(k) && typeof span.attrs.get(k) === 'number') set.add(k);
    }
    usedKeys.set(m.id, set);
  }

  const deprecated = rules.dialects.deprecatedAttributes.filter((d) => span.attrs.has(d.key));
  const models = rules.dialects.dialects.flatMap((d) => d.keys.model);
  const providers = rules.dialects.dialects.flatMap((d) => d.keys.provider);

  const analysis: SpanAnalysis = {
    span,
    dialects: matches.map((m) => m.id),
    matches,
    primary: primaryMatch.id,
    inputIncludesCache: !excludesByTable,
    cacheSuspect,
    normalized: { input: normalizedInput, output: output?.value ?? 0, cacheRead: cr?.value ?? 0, cacheWrite: cw?.value ?? 0 },
    backend: {
      input: backendNumber(span, opts.backend.input),
      output: backendNumber(span, opts.backend.output),
      cacheRead: backendNumber(span, opts.backend.cacheRead),
      cacheWrite: backendNumber(span, opts.backend.cacheWrite),
    },
    usedKeys,
    deprecated,
  };
  if (input) analysis.rawInput = input.value;
  if (output) analysis.rawOutput = output.value;
  const model = firstString(span, models);
  if (model) analysis.model = model;
  const provider = firstString(span, providers);
  if (provider) analysis.provider = provider;
  return analysis;
}
