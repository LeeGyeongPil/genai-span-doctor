// AC-2: six dialects are detected per span; spans without usage attributes are not LLM spans.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeSpan } from '../src/normalize.js';
import { readSpans } from '../src/otlp.js';
import { loadRules, wantedKeys } from '../src/rules.js';
import { example, fixture } from './helpers.js';

const rules = loadRules();
const opts = { backend: rules.backends.backends.otel!, assumeCacheExcluded: new Set<string>() };

function dialectsByName(file: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of readSpans(file, wantedKeys(rules)).spans) {
    const a = analyzeSpan(s, rules, opts);
    out.set(s.name, a ? a.dialects : []);
  }
  return out;
}

test('AC-2: the mixed example spans map to the six dialects', () => {
  const d = dialectsByName(example('mixed-dialects.otlp.json'));
  assert.equal(d.size, 6);
  assert.deepEqual(d.get('chat otel-current'), ['otel-genai']);
  assert.deepEqual(d.get('chat otel-legacy'), ['otel-genai-deprecated']);
  assert.deepEqual(d.get('llm openinference'), ['openinference']);
  assert.deepEqual(d.get('llm_request flat'), ['flat']);
  assert.deepEqual(d.get('ai.generateText.doGenerate'), ['vercel-ai']);
  // OpenLLMetry reuses the current input/output names, so both dialects are recorded on that span.
  assert.deepEqual(d.get('openllmetry chat'), ['otel-genai', 'openllmetry']);
});

test('AC-2: overlapping dialects on one span are all recorded', () => {
  const d = dialectsByName(fixture('conflict.otlp.json'));
  assert.deepEqual(d.get('chat conflict'), ['otel-genai', 'openinference']);
});

test('AC-2: spans without usage attributes are not LLM spans', () => {
  const d = dialectsByName(fixture('clean.otlp.json'));
  assert.deepEqual(d.get('GET /health'), []);
  assert.equal([...d.values()].filter((x) => x.length > 0).length, 2);
});

test('OpenLLMetry span: cache > input is detected and normalized', () => {
  const spans = readSpans(example('mixed-dialects.otlp.json'), wantedKeys(rules)).spans;
  const s = spans.find((x) => x.name === 'openllmetry chat')!;
  const a = analyzeSpan(s, rules, opts)!;
  assert.equal(a.cacheSuspect, true);
  assert.equal(a.normalized.input, 9012);
});
