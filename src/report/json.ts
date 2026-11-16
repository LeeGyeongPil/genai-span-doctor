// JSON report with a fixed structure (schemaVersion 1). Keys and rule ids never change with --lang.
import type { AuditResult } from '../audit.js';

export const SCHEMA_VERSION = 1;

export interface ReportMeta {
  version: string;
  lang: string;
  inputs: string[];
}

export function buildJson(r: AuditResult, meta: ReportMeta): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'genai-span-doctor', version: meta.version },
    backend: r.backendName,
    lang: meta.lang,
    inputs: meta.inputs,
    summary: r.summary,
    spans: r.analyses.map((a) => ({
      file: a.span.file,
      traceId: a.span.traceId,
      spanId: a.span.spanId,
      name: a.span.name,
      model: a.model ?? null,
      provider: a.provider ?? null,
      dialects: a.dialects,
      primaryDialect: a.primary,
      inputIncludesCache: a.inputIncludesCache,
      cacheSuspect: a.cacheSuspect,
      rawInput: a.rawInput ?? null,
      input: { backend: a.backend.input ?? 0, normalized: a.normalized.input },
      output: { backend: a.backend.output ?? 0, normalized: a.normalized.output },
      cacheRead: { backend: a.backend.cacheRead ?? 0, normalized: a.normalized.cacheRead },
      cacheWrite: { backend: a.backend.cacheWrite ?? 0, normalized: a.normalized.cacheWrite },
    })),
    findings: r.findings.map((f) => ({
      ruleId: f.ruleId,
      level: f.level,
      file: f.file,
      traceId: f.traceId,
      spanId: f.spanId,
      spanName: f.spanName,
      message: f.message,
    })),
  };
}
