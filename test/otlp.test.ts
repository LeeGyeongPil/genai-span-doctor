// AC-1: all input paths give the same spans; broken input exits 2 with the path in the message.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { anyValue, readSpans } from '../src/otlp.js';
import { loadRules, wantedKeys } from '../src/rules.js';
import { cli, fixture, json, tmpDir } from './helpers.js';

const wanted = wantedKeys(loadRules());

/** Summary of a span list that does not depend on file names or input order. */
function digest(spans: { name: string; attrs: Map<string, unknown> }[]): string[] {
  return spans
    .map((s) => `${s.name}:${[...s.attrs.entries()].filter(([, v]) => typeof v === 'number').sort().map(([k, v]) => `${k}=${v}`).join(',')}`)
    .sort();
}

test('AC-1: file, JSON Lines, directory and stdin give identical spans', () => {
  const fromJson = readSpans(fixture('five-dialects.otlp.json'), wanted).spans;
  const fromLines = readSpans(fixture('five-dialects.jsonl'), wanted).spans;
  const fromDir = readSpans(fixture('dir'), wanted).spans;
  const text = readFileSync(fixture('five-dialects.otlp.json'), 'utf8');
  const fromStdin = readSpans('-', wanted, () => text).spans;
  assert.equal(fromJson.length, 5);
  assert.deepEqual(digest(fromLines), digest(fromJson));
  assert.deepEqual(digest(fromDir), digest(fromJson));
  assert.deepEqual(digest(fromStdin), digest(fromJson));
});

test('AC-1: the same audit numbers come out of every input path', () => {
  const a = json([fixture('five-dialects.otlp.json')]);
  const b = json([fixture('five-dialects.jsonl')]);
  const c = json([fixture('dir')]);
  assert.deepEqual(b.summary.input, a.summary.input);
  assert.deepEqual(c.summary.input, a.summary.input);
  const d = cli(['-', '--format', 'json', '--fail-on', 'none'], { LANG: 'en_US.UTF-8' }, readFileSync(fixture('five-dialects.otlp.json'), 'utf8'));
  assert.deepEqual(JSON.parse(d.stdout).summary.input, a.summary.input);
});

test('AC-1: string intValue "46313" is read as the number 46313', () => {
  assert.equal(anyValue({ intValue: '46313' }), 46313);
  assert.equal(anyValue({ intValue: 46313 }), 46313);
  const spans = readSpans(fixture('five-dialects.jsonl'), wanted).spans;
  const first = spans.find((s) => s.name === 'chat otel-current');
  assert.equal(first?.attrs.get('gen_ai.usage.input_tokens'), 46313);
});

test('AnyValue handles arrays, maps, bool and double', () => {
  assert.deepEqual(anyValue({ arrayValue: { values: [{ stringValue: 'a' }, { intValue: '2' }] } }), ['a', 2]);
  assert.deepEqual(anyValue({ kvlistValue: { values: [{ key: 'k', value: { boolValue: true } }] } }), { k: true });
  assert.equal(anyValue({ doubleValue: 1.5 }), 1.5);
  assert.equal(anyValue(undefined), undefined);
});

test('prompt and response attributes are never kept', () => {
  const dir = tmpDir('gsd-');
  const file = join(dir, 'p.json');
  const doc = {
    resourceSpans: [{ scopeSpans: [{ spans: [{ name: 'x', attributes: [
      { key: 'gen_ai.input.messages', value: { stringValue: 'secret prompt' } },
      { key: 'gen_ai.usage.input_tokens', value: { intValue: 3 } },
    ] }] }] }],
  };
  writeFileSync(file, JSON.stringify(doc));
  const spans = readSpans(file, wanted).spans;
  assert.deepEqual([...spans[0]!.attrs.keys()], ['gen_ai.usage.input_tokens']);
  const out = cli([file, '--format', 'json', '--fail-on', 'none']);
  assert.ok(!out.stdout.includes('secret prompt'));
});

test('AC-1: broken JSON exits 2 and names the file', () => {
  const dir = tmpDir('gsd-');
  const file = join(dir, 'broken.json');
  writeFileSync(file, '{ "resourceSpans": [ ');
  const r = cli([file]);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes(file), r.stderr);
  assert.match(r.stderr, /Invalid JSON/);
});

test('AC-1: valid JSON that is not OTLP exits 2 and names the file', () => {
  const dir = tmpDir('gsd-');
  const file = join(dir, 'other.json');
  writeFileSync(file, '{"hello": "world"}');
  const r = cli([file]);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes(file));
  assert.match(r.stderr, /not an OTLP traces file/);
});

test('a broken line inside JSON Lines exits 2 with the line number', () => {
  const dir = tmpDir('gsd-');
  const file = join(dir, 'x.jsonl');
  writeFileSync(file, '{"resourceSpans": []}\n{oops\n');
  const r = cli([file]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /line 2/);
});

test('an empty directory exits 2', () => {
  const dir = tmpDir('gsd-');
  const r = cli([dir]);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes(dir));
});

test('directory mode skips non-OTLP JSON and lists it (en and ko)', () => {
  const dir = join(import.meta.dirname, '..', '..', 'examples');
  const r = cli([dir, '--fail-on', 'none']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Skipped: .*prices\.example\.json/);
  const ko = cli([dir, '--fail-on', 'none'], { LANG: 'ko_KR.UTF-8' });
  assert.match(ko.stdout, /건너뜀: .*prices\.example\.json/);
  const j = JSON.parse(cli([dir, '--format', 'json', '--fail-on', 'none']).stdout) as { skipped: string[]; inputs: string[] };
  assert.ok(j.skipped.some((f) => f.endsWith('prices.example.json')));
  assert.ok(j.inputs.every((f) => !f.endsWith('prices.example.json')));
  const s = JSON.parse(cli([dir, '--format', 'sarif', '--fail-on', 'none']).stdout) as { runs: Array<{ properties: { skipped: string[] } }> };
  assert.ok(s.runs[0]?.properties.skipped.some((f) => f.endsWith('prices.example.json')));
  const e = cli([dir]); // default --fail-on error: exit comes from findings only
  assert.ok(e.code === 0 || e.code === 1);
});

test('directory with only non-OTLP JSON exits 2; mid-file JSONL failure drops its spans', () => {
  const dir = tmpDir('gsd-');
  writeFileSync(join(dir, 'a.json'), '{"x": 1}');
  const r = cli([dir]);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes(dir));
  writeFileSync(join(dir, 'b.jsonl'), '{"resourceSpans": [{"scopeSpans": [{"spans": [{"name": "s"}]}]}]}\n{"x": 1}\n');
  assert.throws(() => readSpans(dir, wanted), /skipped 2/); // b.jsonl's first-line span was rolled back
  writeFileSync(join(dir, 'c.json'), '{"resourceSpans": []}');
  const res = readSpans(dir, wanted);
  assert.equal(res.spans.length, 0);
  assert.equal(res.skipped.length, 2);
  assert.equal(res.files.length, 1);
});

test('single non-OTLP file and stdin still exit 2', () => {
  const dir = tmpDir('gsd-');
  const f = join(dir, 'a.json');
  writeFileSync(f, '{"x": 1}');
  assert.equal(cli([f]).code, 2);
  assert.equal(cli(['-'], { LANG: 'en_US.UTF-8' }, '{"x": 1}').code, 2);
});
