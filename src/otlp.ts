// Reads OTLP JSON / JSON Lines from files, directories or stdin and flattens spans.
// Only attributes listed in `wanted` are kept, so prompt and response bodies are never read into memory.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type AttrValue = string | number | boolean | null | AttrValue[] | { [k: string]: AttrValue };

export interface SpanRecord {
  file: string;
  traceId: string;
  spanId: string;
  name: string;
  attrs: Map<string, AttrValue>;
}

/** Error carrying the message shape the CLI prints (exit code 2). */
export class InputError extends Error {
  constructor(
    readonly code: 'readFile' | 'badJson' | 'notOtlp' | 'emptyDir',
    readonly path: string,
    readonly detail: string,
  ) {
    super(`${code}: ${path}: ${detail}`);
    this.name = 'InputError';
  }
}

interface RawAnyValue {
  stringValue?: string;
  intValue?: number | string;
  doubleValue?: number | string;
  boolValue?: boolean;
  arrayValue?: { values?: RawAnyValue[] };
  kvlistValue?: { values?: Array<{ key: string; value?: RawAnyValue }> };
}

/** Converts an OTLP AnyValue. `intValue` may be a number (JS SDK) or a string (protobuf JSON, Collector). */
export function anyValue(v: RawAnyValue | undefined | null): AttrValue | undefined {
  if (v === undefined || v === null || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue ?? null;
  if ('intValue' in v) {
    const n = Number(v.intValue);
    return Number.isFinite(n) ? n : undefined;
  }
  if ('doubleValue' in v) {
    const n = Number(v.doubleValue);
    return Number.isFinite(n) ? n : undefined;
  }
  if ('boolValue' in v) return v.boolValue ?? null;
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map((x) => anyValue(x) ?? null);
  if ('kvlistValue' in v) {
    const out: { [k: string]: AttrValue } = {};
    for (const kv of v.kvlistValue?.values ?? []) out[kv.key] = anyValue(kv.value) ?? null;
    return out;
  }
  return undefined;
}

interface RawSpan {
  traceId?: string;
  spanId?: string;
  name?: string;
  attributes?: Array<{ key: string; value?: RawAnyValue }>;
}

interface RawRequest {
  resourceSpans?: Array<{
    scopeSpans?: Array<{ spans?: RawSpan[] }>;
    instrumentationLibrarySpans?: Array<{ spans?: RawSpan[] }>;
  }>;
}

function extractSpans(doc: unknown, file: string, wanted: Set<string>, out: SpanRecord[]): void {
  const req = doc as RawRequest;
  if (!req || typeof req !== 'object' || !Array.isArray(req.resourceSpans)) {
    throw new InputError('notOtlp', file, 'missing "resourceSpans" array');
  }
  for (const rs of req.resourceSpans) {
    const scopes = rs.scopeSpans ?? rs.instrumentationLibrarySpans ?? [];
    for (const ss of scopes) {
      for (const sp of ss.spans ?? []) {
        const attrs = new Map<string, AttrValue>();
        for (const kv of sp.attributes ?? []) {
          if (!wanted.has(kv.key)) continue;
          const v = anyValue(kv.value);
          if (v !== undefined) attrs.set(kv.key, v);
        }
        out.push({ file, traceId: sp.traceId ?? '', spanId: sp.spanId ?? '', name: sp.name ?? '', attrs });
      }
    }
  }
}

function parseText(text: string, file: string, wanted: Set<string>, out: SpanRecord[]): void {
  const isLines = file.endsWith('.jsonl');
  let wholeError = '';
  if (!isLines) {
    try {
      extractSpans(JSON.parse(text), file, wanted, out);
      return;
    } catch (e) {
      if (e instanceof InputError) throw e;
      // Not a single JSON document: fall through and try JSON Lines before giving up.
      wholeError = (e as Error).message;
      if (!text.trim().includes('\n')) throw new InputError('badJson', file, wholeError);
    }
  }
  const lines = text.split('\n');
  const before = out.length;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    let doc: unknown;
    try {
      doc = JSON.parse(line);
    } catch (e) {
      throw new InputError('badJson', file, wholeError || `line ${i + 1}: ${(e as Error).message}`);
    }
    extractSpans(doc, `${file}`, wanted, out);
  }
  if (out.length === before && text.trim() === '') throw new InputError('notOtlp', file, 'file is empty');
}

function collectFiles(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, acc);
    else if (entry.isFile() && /\.jsonl?$/.test(entry.name)) acc.push(p);
  }
}

/** Reads spans from a file, a directory (recursive *.json / *.jsonl) or "-" (stdin). */
export function readSpans(input: string, wanted: Set<string>, stdin: () => string = () => readFileSync(0, 'utf8')): { spans: SpanRecord[]; files: string[] } {
  const spans: SpanRecord[] = [];
  if (input === '-') {
    parseText(stdin(), '<stdin>', wanted, spans);
    return { spans, files: ['<stdin>'] };
  }
  let st;
  try {
    st = statSync(input);
  } catch (e) {
    throw new InputError('readFile', input, (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file or directory' : (e as Error).message);
  }
  const files: string[] = [];
  if (st.isDirectory()) {
    collectFiles(input, files);
    if (files.length === 0) throw new InputError('emptyDir', input, 'no *.json or *.jsonl files found');
  } else {
    files.push(input);
  }
  for (const f of files) {
    let text: string;
    try {
      text = readFileSync(f, 'utf8');
    } catch (e) {
      throw new InputError('readFile', f, (e as Error).message);
    }
    parseText(text, f, wanted, spans);
  }
  return { spans, files };
}
