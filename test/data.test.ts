// AC-9: every rule-table entry has a source and checked date, and attribute names match the official constants.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as otel from '@opentelemetry/semantic-conventions/incubating';
import { SemanticConventions as OI } from '@arizeai/openinference-semantic-conventions';
import { SpanAttributes as Traceloop } from '@traceloop/ai-semantic-conventions';
import { loadRules, validateBackends, validateDialects } from '../src/rules.js';

const rules = loadRules();
const dialect = (id: string) => rules.dialects.dialects.find((d) => d.id === id)!;

test('AC-9: every dialect and backend has a source URL and checked date', () => {
  for (const d of rules.dialects.dialects) {
    assert.ok(d.sources.length > 0, d.id);
    for (const s of d.sources) {
      assert.match(s.url, /^https:\/\//, d.id);
      assert.match(s.checked, /^\d{4}-\d{2}-\d{2}$/, d.id);
    }
  }
  for (const [name, b] of Object.entries(rules.backends.backends)) {
    assert.ok(b.sources.length > 0, name);
    for (const s of b.sources) assert.match(s.checked, /^\d{4}-\d{2}-\d{2}$/, name);
  }
  for (const dep of rules.dialects.deprecatedAttributes) {
    assert.match(dep.source, /^https:\/\//);
    assert.match(dep.checked, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('AC-9: otel-genai keys equal the @opentelemetry/semantic-conventions 1.45.0 incubating constants', () => {
  const k = dialect('otel-genai').keys;
  assert.deepEqual(k.input, [otel.ATTR_GEN_AI_USAGE_INPUT_TOKENS]);
  assert.deepEqual(k.output, [otel.ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]);
  assert.deepEqual(k.cacheRead, [otel.ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]);
  assert.deepEqual(k.cacheWrite, [otel.ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]);
  assert.deepEqual(k.reasoning, [otel.ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]);
  assert.deepEqual(k.provider, [otel.ATTR_GEN_AI_PROVIDER_NAME]);
  assert.deepEqual(rules.dialects.standard, {
    input: otel.ATTR_GEN_AI_USAGE_INPUT_TOKENS,
    output: otel.ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
    cacheRead: otel.ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
    cacheWrite: otel.ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  });
});

test('AC-9: deprecated keys equal the deprecated OTel constants', () => {
  const d = dialect('otel-genai-deprecated').keys;
  assert.deepEqual(d.input, [otel.ATTR_GEN_AI_USAGE_PROMPT_TOKENS]);
  assert.deepEqual(d.output, [otel.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS]);
  assert.deepEqual(d.provider, [otel.ATTR_GEN_AI_SYSTEM]);
  const dep = new Map(rules.dialects.deprecatedAttributes.map((x) => [x.key, x.replacement]));
  assert.equal(dep.get(otel.ATTR_GEN_AI_USAGE_PROMPT_TOKENS), otel.ATTR_GEN_AI_USAGE_INPUT_TOKENS);
  assert.equal(dep.get(otel.ATTR_GEN_AI_USAGE_COMPLETION_TOKENS), otel.ATTR_GEN_AI_USAGE_OUTPUT_TOKENS);
  assert.equal(dep.get(otel.ATTR_GEN_AI_SYSTEM), otel.ATTR_GEN_AI_PROVIDER_NAME);
});

test('AC-9: openinference keys equal @arizeai/openinference-semantic-conventions 2.17.0 constants', () => {
  const k = dialect('openinference').keys;
  assert.deepEqual(k.input, [OI.LLM_TOKEN_COUNT_PROMPT]);
  assert.deepEqual(k.output, [OI.LLM_TOKEN_COUNT_COMPLETION]);
  assert.deepEqual(k.cacheRead, [OI.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ]);
  assert.deepEqual(k.cacheWrite, [OI.LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_WRITE]);
  assert.deepEqual(k.reasoning, [OI.LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING]);
  assert.deepEqual(k.total, [OI.LLM_TOKEN_COUNT_TOTAL]);
  assert.deepEqual(k.model, [OI.LLM_MODEL_NAME]);
});

test('AC-9: openllmetry keys equal @traceloop/ai-semantic-conventions 0.27.0 constants', () => {
  const k = dialect('openllmetry').keys;
  assert.deepEqual(k.cacheRead, [Traceloop.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]);
  assert.deepEqual(k.cacheWrite, [Traceloop.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]);
  assert.deepEqual(k.reasoning, [Traceloop.GEN_AI_USAGE_REASONING_TOKENS]);
  assert.deepEqual(k.total, [Traceloop.GEN_AI_USAGE_TOTAL_TOKENS, Traceloop.LLM_USAGE_TOTAL_TOKENS]);
});

test('validation rejects a dialect without a source', () => {
  const bad = structuredClone({ ...rules.dialects });
  bad.dialects = bad.dialects.map((d, i) => (i === 0 ? { ...d, sources: [] } : d));
  assert.throws(() => validateDialects(bad), /at least one source/);
  const badDate = structuredClone({ ...rules.dialects });
  badDate.dialects = badDate.dialects.map((d, i) => (i === 0 ? { ...d, sources: [{ url: 'https://x.y', checked: 'yesterday' }] } : d));
  assert.throws(() => validateDialects(badDate), /checked date/);
  assert.throws(() => validateBackends({ default: 'x', backends: {} }), /default backend/);
});

test('priority lists every dialect exactly once', () => {
  assert.deepEqual([...rules.dialects.priority].sort(), rules.dialects.dialects.map((d) => d.id).sort());
});
