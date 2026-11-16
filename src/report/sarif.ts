// SARIF 2.1.0 report: six rules, results carry the span as a logical location.
import type { AuditResult } from '../audit.js';
import { RULE_IDS, RULE_LEVEL } from '../findings.js';
import type { Translator } from '../i18n.js';

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

export function buildSarif(r: AuditResult, version: string, t: Translator, skipped: string[] = []): Record<string, unknown> {
  const rules = RULE_IDS.map((id) => ({
    id,
    name: id,
    shortDescription: { text: t(`rule.${id}.short` as 'rule.GSD001.short') },
    help: { text: t(`rule.${id}.help` as 'rule.GSD001.help') },
    defaultConfiguration: { level: RULE_LEVEL[id] },
  }));
  const results = r.findings.map((f) => ({
    ruleId: f.ruleId,
    ruleIndex: RULE_IDS.indexOf(f.ruleId),
    level: f.level,
    message: { text: f.message },
    locations: [
      {
        physicalLocation: { artifactLocation: { uri: f.file } },
        ...(f.spanName || f.spanId
          ? {
              logicalLocations: [
                { name: f.spanName, kind: 'span', fullyQualifiedName: `${f.traceId}/${f.spanId}` },
              ],
            }
          : {}),
      },
    ],
  }));
  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'genai-span-doctor',
            version,
            informationUri: 'https://github.com/LeeGyeongPil/genai-span-doctor',
            rules,
          },
        },
        results,
        properties: { skipped },
      },
    ],
  };
}
