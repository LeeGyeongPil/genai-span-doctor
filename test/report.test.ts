// AC-7: JSON report has a fixed schemaVersion 1 structure; SARIF is 2.1.0 with six rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cli, fixture } from './helpers.js';

const five = fixture('five-dialects.otlp.json');

test('AC-7: JSON report has the required keys', () => {
  const j = JSON.parse(cli([five, '--format', 'json', '--fail-on', 'none']).stdout);
  assert.equal(j.schemaVersion, 1);
  for (const k of ['tool', 'backend', 'lang', 'inputs', 'summary', 'spans', 'findings']) assert.ok(k in j, k);
  for (const k of ['files', 'spans', 'llmSpans', 'dialects', 'input', 'output', 'cacheRead', 'cacheWrite', 'findings']) assert.ok(k in j.summary, k);
  for (const k of ['file', 'traceId', 'spanId', 'name', 'dialects', 'primaryDialect', 'input', 'output']) assert.ok(k in j.spans[0], k);
  for (const k of ['ruleId', 'level', 'file', 'spanName', 'message']) assert.ok(k in j.findings[0], k);
});

test('AC-7: JSON keys and rule ids do not change with the language', () => {
  const en = JSON.parse(cli([five, '--format', 'json', '--fail-on', 'none', '--lang', 'en']).stdout);
  const ko = JSON.parse(cli([five, '--format', 'json', '--fail-on', 'none', '--lang', 'ko']).stdout);
  assert.deepEqual(en.findings.map((f: any) => [f.ruleId, f.level]), ko.findings.map((f: any) => [f.ruleId, f.level]));
  assert.notEqual(en.findings[0].message, ko.findings[0].message);
  assert.deepEqual(en.summary, ko.summary);
});

test('AC-7: SARIF is 2.1.0 with six rules and ruleId/level mapping', () => {
  const s = JSON.parse(cli([five, '--format', 'sarif', '--fail-on', 'none']).stdout);
  assert.equal(s.version, '2.1.0');
  assert.match(s.$schema, /sarif-2\.1\.0/);
  const rules = s.runs[0].tool.driver.rules;
  assert.equal(rules.length, 6);
  assert.deepEqual(rules.map((r: any) => r.id), ['GSD001', 'GSD002', 'GSD003', 'GSD004', 'GSD005', 'GSD006']);
  const levelOf = new Map<string, string>(rules.map((r: any) => [r.id, r.defaultConfiguration.level]));
  assert.equal(s.runs[0].results.length, 8);
  for (const res of s.runs[0].results) {
    assert.equal(res.level, levelOf.get(res.ruleId));
    assert.equal(rules[res.ruleIndex].id, res.ruleId);
    assert.ok(res.locations[0].physicalLocation.artifactLocation.uri);
  }
  const withSpan = s.runs[0].results.find((r: any) => r.ruleId === 'GSD003');
  assert.equal(withSpan.locations[0].logicalLocations[0].name, 'llm openinference');
});

test('table output has no color escape codes', () => {
  const out = cli([five, '--fail-on', 'none']).stdout;
  assert.ok(!out.includes('\u001b['));
});
