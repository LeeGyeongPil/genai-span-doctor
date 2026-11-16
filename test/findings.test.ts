// AC-4: GSD001-GSD006 each fire on a dedicated fixture, clean has none, flags and exit codes behave.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cli, example, fixture, json, tmpDir } from './helpers.js';

const ids = (file: string, extra: string[] = []): string[] => json([file, ...extra]).findings.map((f: any) => f.ruleId).sort();

test('GSD001 fires for spans the backend cannot read', () => {
  assert.equal(ids(fixture('five-dialects.otlp.json')).filter((x) => x === 'GSD001').length, 4);
});

test('GSD002 fires for deprecated attribute names', () => {
  const f = json([fixture('five-dialects.otlp.json')]).findings.filter((x: any) => x.ruleId === 'GSD002');
  assert.deepEqual(f.map((x: any) => x.spanName).sort(), ['chat otel-legacy', 'llm_request flat']);
});

test('GSD003 fires when cache exceeds input', () => {
  const f = json([fixture('five-dialects.otlp.json')]).findings.filter((x: any) => x.ruleId === 'GSD003');
  assert.equal(f.length, 1);
  assert.equal(f[0].spanName, 'llm openinference');
  assert.match(f[0].message, /40192/);
});

test('GSD004 fires when dialects disagree', () => {
  assert.deepEqual(ids(fixture('conflict.otlp.json')), ['GSD004']);
  const f = json([fixture('conflict.otlp.json')]).findings[0];
  assert.match(f.message, /100/);
  assert.match(f.message, /200/);
});

test('GSD005 fires when total differs from input + output', () => {
  assert.deepEqual(ids(fixture('total-mismatch.otlp.json')), ['GSD005']);
});

test('GSD005 does not fire when the total matches', () => {
  const j = json([example('mixed-dialects.otlp.json')]);
  assert.equal(j.findings.filter((f: any) => f.ruleId === 'GSD005').length, 0);
});

test('GSD006 fires once per file with mixed dialects', () => {
  const f = json([fixture('five-dialects.otlp.json')]).findings.filter((x: any) => x.ruleId === 'GSD006');
  assert.equal(f.length, 1);
  assert.equal(f[0].spanId, '');
});

test('the clean fixture has no findings and exits 0', () => {
  const r = cli([fixture('clean.otlp.json')]);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(json([fixture('clean.otlp.json')]).findings, []);
});

test('exit code follows --fail-on', () => {
  assert.equal(cli([fixture('five-dialects.otlp.json')]).code, 1);
  assert.equal(cli([fixture('five-dialects.otlp.json'), '--fail-on', 'none']).code, 0);
  // The conflict fixture only has a warning.
  assert.equal(cli([fixture('conflict.otlp.json')]).code, 0);
  assert.equal(cli([fixture('conflict.otlp.json'), '--fail-on', 'warning']).code, 1);
  // The clean fixture passes even at the strictest level.
  assert.equal(cli([fixture('clean.otlp.json'), '--fail-on', 'note']).code, 0);
  // five-dialects has a GSD006 note, so --fail-on note also fails (and so does the default).
  assert.equal(cli([fixture('five-dialects.otlp.json'), '--fail-on', 'note']).code, 1);
});

test('a missing file exits 2', () => {
  const r = cli([fixture('does-not-exist.json')]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /does-not-exist\.json/);
});

test('--assume-cache-excluded changes normalization', () => {
  const base = json([fixture('clean.otlp.json')]);
  const forced = json([fixture('clean.otlp.json'), '--assume-cache-excluded', 'otel-genai']);
  assert.equal(base.summary.input.normalized, 155);
  assert.equal(forced.summary.input.normalized, 195);
});

test('an unknown dialect id in --assume-cache-excluded exits 2', () => {
  const r = cli([fixture('clean.otlp.json'), '--assume-cache-excluded', 'nope']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /otel-genai/);
});

test('no LLM spans: exit 0 and a hint', () => {
  const dir = tmpDir('gsd-');
  const file = join(dir, 'http-only.json');
  writeFileSync(file, JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [{ name: 'GET /', attributes: [] }] }] }] }));
  const r = cli([file]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /No spans with token-usage attributes/);
});

test('GSD001 lists both expected input and output keys when both are missing', () => {
  const r = JSON.parse(cli([example('mixed-dialects.otlp.json'), '--format', 'json', '--fail-on', 'none']).stdout);
  const both = r.findings.filter((f: any) => f.ruleId === 'GSD001' && /input and output/.test(f.message));
  assert.ok(both.length > 0);
  for (const f of both) assert.match(f.message, /Expected one of: .*input_tokens.* \/ .*output_tokens/);
});
