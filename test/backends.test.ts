// AC-5: --backend changes GSD001 according to data/backends.json.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { json, fixture } from './helpers.js';

function gsd001Spans(backend: string): string[] {
  const j = json([fixture('five-dialects.otlp.json'), '--backend', backend]);
  return j.findings.filter((f: any) => f.ruleId === 'GSD001').map((f: any) => f.spanName).sort();
}

test('AC-5: OpenInference-only span is GSD001 under otel but not phoenix or langfuse', () => {
  assert.ok(gsd001Spans('otel').includes('llm openinference'));
  assert.ok(!gsd001Spans('phoenix').includes('llm openinference'));
  assert.ok(!gsd001Spans('langfuse').includes('llm openinference'));
});

test('AC-5: the flat span is GSD001 under all three backends', () => {
  for (const b of ['otel', 'langfuse', 'phoenix']) assert.ok(gsd001Spans(b).includes('llm_request flat'), b);
});

test('AC-5: Vercel ai.* spans are GSD001 everywhere; deprecated names depend on the backend', () => {
  for (const b of ['otel', 'langfuse', 'phoenix']) assert.ok(gsd001Spans(b).includes('ai.generateText.doGenerate'), b);
  assert.ok(gsd001Spans('otel').includes('chat otel-legacy'));
  assert.ok(!gsd001Spans('langfuse').includes('chat otel-legacy'));
});

test('AC-5: the backend changes the summary the backend would show', () => {
  const otel = json([fixture('five-dialects.otlp.json'), '--backend', 'otel']);
  const phoenix = json([fixture('five-dialects.otlp.json'), '--backend', 'phoenix']);
  assert.equal(otel.summary.input.backend, 46313);
  assert.equal(phoenix.summary.input.backend, 46313 + 443);
  assert.equal(phoenix.summary.input.normalized, otel.summary.input.normalized);
});
