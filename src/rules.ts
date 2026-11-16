// Loads and validates the rule tables in data/ (dialects and backend views).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Field = 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'reasoning' | 'total' | 'model' | 'provider';
export const FIELDS: readonly Field[] = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'total', 'model', 'provider'];

export interface Source {
  url: string;
  checked: string;
}

export interface Dialect {
  id: string;
  label: string;
  keys: Record<Field, string[]>;
  detect: string[];
  inputIncludesCache: boolean | 'unknown';
  notes: string;
  sources: Source[];
}

export interface DeprecatedAttribute {
  key: string;
  replacement: string;
  source: string;
  checked: string;
}

export interface StandardKeys {
  input: string;
  output: string;
  cacheRead: string;
  cacheWrite: string;
}

export interface DialectRules {
  standard: StandardKeys;
  priority: string[];
  deprecatedAttributes: DeprecatedAttribute[];
  dialects: Dialect[];
}

export interface Backend {
  label: string;
  input: string[];
  output: string[];
  cacheRead: string[];
  cacheWrite: string[];
  sources: Source[];
}

export interface BackendRules {
  default: string;
  backends: Record<string, Backend>;
}

export interface Rules {
  dialects: DialectRules;
  backends: BackendRules;
}

const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

function fail(file: string, detail: string): never {
  throw new Error(`Invalid rule table ${file}: ${detail}. Fix the data file or restore it from the package.`);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function checkSources(file: string, where: string, sources: unknown): void {
  if (!Array.isArray(sources) || sources.length === 0) fail(file, `${where} needs at least one source`);
  for (const s of sources as Array<Record<string, unknown>>) {
    if (typeof s.url !== 'string' || !/^https?:\/\//.test(s.url)) fail(file, `${where} has a source without an http(s) url`);
    if (typeof s.checked !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.checked)) fail(file, `${where} has a source without a YYYY-MM-DD checked date`);
  }
}

export function validateDialects(raw: unknown, file = 'dialects.json'): DialectRules {
  const r = raw as DialectRules;
  if (!r || !Array.isArray(r.dialects) || r.dialects.length === 0) fail(file, 'dialects must be a non-empty array');
  if (!r.standard || typeof r.standard.input !== 'string') fail(file, 'standard keys are missing');
  const ids = new Set<string>();
  for (const d of r.dialects) {
    if (typeof d.id !== 'string' || !d.id) fail(file, 'a dialect has no id');
    if (ids.has(d.id)) fail(file, `duplicate dialect id ${d.id}`);
    ids.add(d.id);
    for (const f of FIELDS) if (!isStringArray(d.keys?.[f])) fail(file, `dialect ${d.id} keys.${f} must be a string array`);
    if (!isStringArray(d.detect)) fail(file, `dialect ${d.id} detect must be a string array`);
    if (![true, false, 'unknown'].includes(d.inputIncludesCache as never)) fail(file, `dialect ${d.id} inputIncludesCache must be true, false or "unknown"`);
    checkSources(file, `dialect ${d.id}`, d.sources);
  }
  if (!isStringArray(r.priority) || r.priority.some((p) => !ids.has(p)) || r.priority.length !== ids.size) {
    fail(file, 'priority must list every dialect id exactly once');
  }
  for (const dep of r.deprecatedAttributes ?? []) {
    if (!dep.key || !dep.replacement || !dep.source || !dep.checked) fail(file, 'a deprecated attribute is missing key, replacement, source or checked');
  }
  return r;
}

export function validateBackends(raw: unknown, file = 'backends.json'): BackendRules {
  const r = raw as BackendRules;
  if (!r || typeof r.backends !== 'object' || !r.backends || !r.backends[r.default]) fail(file, 'default backend must exist in backends');
  for (const [name, b] of Object.entries(r.backends)) {
    for (const f of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
      if (!isStringArray(b[f])) fail(file, `backend ${name} ${f} must be a string array`);
    }
    checkSources(file, `backend ${name}`, b.sources);
  }
  return r;
}

let cached: Rules | undefined;

/** Loads data/dialects.json and data/backends.json once per process. */
export function loadRules(): Rules {
  if (cached) return cached;
  const read = (name: string): unknown => JSON.parse(readFileSync(DATA_DIR + name, 'utf8'));
  cached = {
    dialects: validateDialects(read('dialects.json')),
    backends: validateBackends(read('backends.json')),
  };
  return cached;
}

/** Every attribute key the tool cares about; all other attributes are dropped while parsing. */
export function wantedKeys(rules: Rules): Set<string> {
  const keys = new Set<string>();
  for (const d of rules.dialects.dialects) {
    for (const f of FIELDS) for (const k of d.keys[f]) keys.add(k);
    for (const k of d.detect) keys.add(k);
  }
  for (const dep of rules.dialects.deprecatedAttributes) keys.add(dep.key);
  for (const b of Object.values(rules.backends.backends)) {
    for (const k of [...b.input, ...b.output, ...b.cacheRead, ...b.cacheWrite]) keys.add(k);
  }
  for (const k of Object.values(rules.dialects.standard)) keys.add(k);
  return keys;
}
