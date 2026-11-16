// Ties parsing, analysis, findings and cost together into one result object that reports render.
import { computeCost, type Prices } from './cost.js';
import { evaluate, RULE_IDS, type Finding, type RuleId } from './findings.js';
import type { Translator } from './i18n.js';
import { analyzeSpan, type SpanAnalysis } from './normalize.js';
import type { SpanRecord } from './otlp.js';
import type { Rules } from './rules.js';

export interface Pair {
  backend: number;
  normalized: number;
}

export interface Summary {
  files: number;
  spans: number;
  llmSpans: number;
  dialects: Record<string, number>;
  input: Pair;
  output: Pair;
  cacheRead: Pair;
  cacheWrite: Pair;
  findings: Record<RuleId, number> & { total: number };
  cost?: Pair;
}

export interface AuditOptions {
  backendName: string;
  assumeCacheExcluded: ReadonlySet<string>;
  prices?: Prices;
  files: string[];
  t: Translator;
}

export interface AuditResult {
  backendName: string;
  analyses: SpanAnalysis[];
  findings: Finding[];
  summary: Summary;
}

export function runAudit(spans: SpanRecord[], rules: Rules, opts: AuditOptions): AuditResult {
  const backend = rules.backends.backends[opts.backendName];
  if (!backend) throw new Error(`Unknown backend "${opts.backendName}"`);
  const analyses: SpanAnalysis[] = [];
  for (const s of spans) {
    const a = analyzeSpan(s, rules, { backend, assumeCacheExcluded: opts.assumeCacheExcluded });
    if (a) analyses.push(a);
  }
  const findings = evaluate(analyses, {
    rules,
    backendName: opts.backendName,
    backend,
    assumeCacheExcluded: opts.assumeCacheExcluded,
    t: opts.t,
  });

  const sum = (pick: (a: SpanAnalysis) => [number, number]): Pair =>
    analyses.reduce<Pair>((acc, a) => {
      const [b, n] = pick(a);
      return { backend: acc.backend + b, normalized: acc.normalized + n };
    }, { backend: 0, normalized: 0 });

  const dialects: Record<string, number> = {};
  for (const a of analyses) for (const d of a.dialects) dialects[d] = (dialects[d] ?? 0) + 1;

  const counts = { total: findings.length } as Record<RuleId, number> & { total: number };
  for (const id of RULE_IDS) counts[id] = findings.filter((f) => f.ruleId === id).length;

  const summary: Summary = {
    files: opts.files.length,
    spans: spans.length,
    llmSpans: analyses.length,
    dialects,
    input: sum((a) => [a.backend.input ?? 0, a.normalized.input]),
    output: sum((a) => [a.backend.output ?? 0, a.normalized.output]),
    cacheRead: sum((a) => [a.backend.cacheRead ?? 0, a.normalized.cacheRead]),
    cacheWrite: sum((a) => [a.backend.cacheWrite ?? 0, a.normalized.cacheWrite]),
    findings: counts,
  };
  if (opts.prices) summary.cost = computeCost(analyses, opts.prices);
  return { backendName: opts.backendName, analyses, findings, summary };
}
