// Cost preview from user-supplied per-1M-token prices. The tool ships no provider prices.
import { readFileSync } from 'node:fs';
import type { SpanAnalysis } from './normalize.js';

export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Prices {
  default: Price;
  models: Record<string, Price>;
}

export class PricesError extends Error {
  constructor(
    readonly path: string,
    readonly detail: string,
  ) {
    super(`${path}: ${detail}`);
    this.name = 'PricesError';
  }
}

function toPrice(path: string, where: string, raw: unknown, fallback?: Price): Price {
  if (!raw || typeof raw !== 'object') throw new PricesError(path, `${where} must be an object`);
  const r = raw as Record<string, unknown>;
  const num = (key: string, dflt?: number): number => {
    const v = r[key];
    if (v === undefined && dflt !== undefined) return dflt;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new PricesError(path, `${where}.${key} must be a non-negative number (price per 1M tokens)`);
    }
    return v;
  };
  const input = num('input', fallback?.input);
  const output = num('output', fallback?.output);
  // Missing cache prices fall back to the plain input price.
  return { input, output, cacheRead: num('cache_read', input), cacheWrite: num('cache_write', input) };
}

/** Parses prices JSON: { "default": {input, output, cache_read?, cache_write?}, "models": { "<name>": {...} } }. */
export function parsePrices(path: string, text: string): Prices {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new PricesError(path, `invalid JSON (${(e as Error).message})`);
  }
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== 'object' || !('default' in r)) throw new PricesError(path, 'missing "default" prices');
  const def = toPrice(path, 'default', r.default);
  const models: Record<string, Price> = {};
  const rawModels = (r.models ?? {}) as Record<string, unknown>;
  if (typeof rawModels !== 'object' || rawModels === null) throw new PricesError(path, '"models" must be an object');
  for (const [name, p] of Object.entries(rawModels)) models[name] = toPrice(path, `models.${name}`, p, def);
  return { default: def, models };
}

export function loadPrices(path: string): Prices {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new PricesError(path, (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (e as Error).message);
  }
  return parsePrices(path, text);
}

function cost(p: Price, input: number, output: number, cacheRead: number, cacheWrite: number): number {
  const uncached = Math.max(0, input - cacheRead - cacheWrite);
  return (uncached * p.input + output * p.output + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) / 1_000_000;
}

const round6 = (n: number): number => Number(n.toFixed(6));

/** Cost the backend would compute from what it reads, versus cost from normalized values. */
export function computeCost(analyses: SpanAnalysis[], prices: Prices): { backend: number; normalized: number } {
  let backend = 0;
  let normalized = 0;
  for (const a of analyses) {
    const p = (a.model && prices.models[a.model]) || prices.default;
    const b = a.backend;
    backend += cost(p, b.input ?? 0, b.output ?? 0, b.cacheRead ?? 0, b.cacheWrite ?? 0);
    const n = a.normalized;
    normalized += cost(p, n.input, n.output, n.cacheRead, n.cacheWrite);
  }
  return { backend: round6(backend), normalized: round6(normalized) };
}
