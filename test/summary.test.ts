// AC-3 and AC-10: summary numbers (reproducing the probe values) through the real command line.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, cliProcess, example, fixture, tmpDir } from './helpers.js';

const five = fixture('five-dialects.otlp.json');

test('AC-3: backend-visible vs normalized totals reproduce the probe values', () => {
  const r = cliProcess([five, '--format', 'json', '--fail-on', 'none']);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.summary.input.backend, 46313);
  assert.equal(j.summary.input.normalized, 133431);
  assert.equal(j.summary.output.backend, 137);
  assert.equal(j.summary.output.normalized, 2129);
  const byName = new Map<string, any>(j.spans.map((s: any) => [s.name, s]));
  assert.equal(byName.get('llm_request flat').input.normalized, 46313);
  assert.equal(byName.get('llm openinference').input.normalized, 40635);
  assert.equal(byName.get('chat otel-legacy').input.normalized, 120);
  assert.equal(j.summary.cost, undefined, 'no cost without --prices');
});

test('AC-3: the default table prints the example', () => {
  const r = cliProcess([example('mixed-dialects.otlp.json'), '--fail-on', 'none']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /openllmetry chat/);
  assert.match(r.stdout, /Input tokens:/);
});

test('AC-10: --prices computes backend and normalized cost', () => {
  const r = cliProcess([five, '--prices', example('prices.example.json'), '--format', 'json', '--fail-on', 'none']);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.summary.cost.backend, 0.095508);
  assert.equal(j.summary.cost.normalized, 0.233318);
});

test('AC-10: model-specific prices override the default and the table shows cost', () => {
  const r = cliProcess([five, '--prices', example('prices.example.json'), '--fail-on', 'none']);
  assert.match(r.stdout, /Cost \(your prices\): 0\.095508 seen by the backend \/ 0\.233318 normalized/);
});

test('AC-3: the default table stays fast on a large export (about 24k spans)', () => {
  const line = JSON.stringify(JSON.parse(readFileSync(example('mixed-dialects.otlp.json'), 'utf8')));
  const file = join(tmpDir(), 'big.jsonl');
  writeFileSync(file, Array.from({ length: 4000 }, () => line).join('\n') + '\n');
  const start = Date.now();
  const r = cli([file, '--fail-on', 'none']);
  const ms = Date.now() - start;
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Summary/);
  assert.ok(ms < 5000, `table output took ${ms} ms`);
});
