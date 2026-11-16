// Dialect detection: which attribute dialects does one span use, and what values do they carry?
import type { AttrValue, SpanRecord } from './otlp.js';
import type { Dialect, Field, Rules } from './rules.js';

export interface FieldValue {
  key: string;
  value: number;
}

export interface DialectMatch {
  id: string;
  dialect: Dialect;
  input?: FieldValue;
  output?: FieldValue;
  cacheRead?: FieldValue;
  cacheWrite?: FieldValue;
  reasoning?: FieldValue;
  total?: FieldValue;
}

function numeric(v: AttrValue | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** First candidate key that holds a non-negative number. */
export function firstNumber(span: SpanRecord, keys: string[]): FieldValue | undefined {
  for (const key of keys) {
    const value = numeric(span.attrs.get(key));
    if (value !== undefined) return { key, value };
  }
  return undefined;
}

/** First candidate key that holds a non-empty string. */
export function firstString(span: SpanRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = span.attrs.get(key);
    if (typeof v === 'string' && v !== '') return v;
  }
  return undefined;
}

/**
 * Returns every dialect whose detection keys appear on the span (as numbers), in priority order.
 * Several dialects can match one span, for example flat keys copied next to standard names.
 */
export function detectDialects(span: SpanRecord, rules: Rules): DialectMatch[] {
  const byId = new Map(rules.dialects.dialects.map((d) => [d.id, d]));
  const matches: DialectMatch[] = [];
  for (const id of rules.dialects.priority) {
    const dialect = byId.get(id);
    if (!dialect) continue;
    if (!dialect.detect.some((k) => numeric(span.attrs.get(k)) !== undefined)) continue;
    const pick = (f: Field): FieldValue | undefined => firstNumber(span, dialect.keys[f]);
    const match: DialectMatch = { id, dialect };
    const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'total'] as const;
    for (const f of fields) {
      const v = pick(f);
      if (v) match[f] = v;
    }
    matches.push(match);
  }
  return matches;
}
