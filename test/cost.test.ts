// AC-10 (unit level): price parsing, model overrides, validation errors.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parsePrices, PricesError } from '../src/cost.js';
import { cli, fixture, tmpDir } from './helpers.js';

test('parsePrices fills missing cache prices with the input price', () => {
  const p = parsePrices('p.json', '{"default": {"input": 2, "output": 8}}');
  assert.deepEqual(p.default, { input: 2, output: 8, cacheRead: 2, cacheWrite: 2 });
});

test('model prices inherit from the default', () => {
  const p = parsePrices('p.json', '{"default": {"input": 2, "output": 8}, "models": {"m": {"output": 20}}}');
  assert.deepEqual(p.models.m, { input: 2, output: 20, cacheRead: 2, cacheWrite: 2 });
});

test('invalid prices raise a PricesError that names the problem', () => {
  assert.throws(() => parsePrices('p.json', '{"default": {"input": -1, "output": 8}}'), PricesError);
  assert.throws(() => parsePrices('p.json', '{}'), /missing "default"/);
  assert.throws(() => parsePrices('p.json', 'nope'), /invalid JSON/);
});

test('a bad prices file makes the CLI exit 2 with the path', () => {
  const dir = tmpDir('gsd-');
  const file = join(dir, 'prices.json');
  writeFileSync(file, '{"default": {"input": "three", "output": 1}}');
  const r = cli([fixture('clean.otlp.json'), '--prices', file]);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes(file));
});

test('per-model prices are used for matching spans', () => {
  const dir = tmpDir('gsd-');
  const file = join(dir, 'prices.json');
  writeFileSync(file, JSON.stringify({ default: { input: 1, output: 1 }, models: { 'model-b': { input: 10, output: 10 } } }));
  const r = cli([fixture('clean.otlp.json'), '--prices', file, '--format', 'json']);
  const cost = JSON.parse(r.stdout).summary.cost;
  // clean-a (model-a): uncached 60 in + 20 out + cache 40 at input price = 120 / 1e6; clean-b (model-b): (55 + 8) * 10 = 630 / 1e6
  assert.equal(cost.normalized, 0.00075);
  assert.equal(cost.backend, 0.00075);
});
