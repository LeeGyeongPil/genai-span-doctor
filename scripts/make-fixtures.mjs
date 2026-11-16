// Regenerates example and test fixtures with the official OpenTelemetry JS SDK serializer.
// Usage: npm install && npm run fixtures
// All traces are synthetic: model names are made up and no prompt or response text is included.
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = 1763280000000; // fixed timestamp so regenerated files only change when the spans change

/** Deterministic ids keep the fixtures stable between runs. */
function makeIdGenerator() {
  let n = 0;
  const hex = (len) => (++n).toString(16).padStart(len, '0');
  return { generateTraceId: () => hex(32), generateSpanId: () => hex(16) };
}

/** Builds spans (one trace each) and returns the finished span objects. */
async function buildSpans(spec) {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'demo-app' }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    idGenerator: makeIdGenerator(),
  });
  const tracer = provider.getTracer('genai-span-doctor-fixtures', '0.1.0');
  for (const [name, attributes] of spec) {
    const span = tracer.startSpan(name, { attributes, startTime: START });
    span.end(START + 1000);
  }
  await provider.forceFlush();
  return exporter.getFinishedSpans();
}

const toJson = (spans) => JSON.parse(new TextDecoder().decode(JsonTraceSerializer.serializeRequest(spans)));

/** Collector file-exporter style: protobuf JSON rules encode int64 as strings. */
function intsAsStrings(node) {
  if (Array.isArray(node)) return node.map(intsAsStrings);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, k === 'intValue' ? String(v) : intsAsStrings(v)]),
    );
  }
  return node;
}

const write = (rel, text) => {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log('wrote', rel);
};

const FIVE = [
  ['chat otel-current', {
    'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': 'anthropic', 'gen_ai.request.model': 'model-a',
    'gen_ai.usage.input_tokens': 46313, 'gen_ai.usage.output_tokens': 137,
    'gen_ai.usage.cache_read.input_tokens': 23251, 'gen_ai.usage.cache_creation.input_tokens': 23056,
  }],
  ['chat otel-legacy', {
    'gen_ai.system': 'openai', 'gen_ai.request.model': 'model-b',
    'gen_ai.usage.prompt_tokens': 120, 'gen_ai.usage.completion_tokens': 40,
  }],
  ['llm openinference', {
    'openinference.span.kind': 'LLM', 'llm.model_name': 'model-c', 'llm.system': 'anthropic',
    'llm.token_count.prompt': 443, 'llm.token_count.completion': 1806,
    'llm.token_count.prompt_details.cache_read': 40024, 'llm.token_count.prompt_details.cache_write': 168,
  }],
  ['llm_request flat', {
    'gen_ai.system': 'anthropic', 'gen_ai.request.model': 'model-d', model: 'model-d',
    input_tokens: 6, output_tokens: 137, cache_read_tokens: 23251, cache_creation_tokens: 23056,
  }],
  ['ai.generateText.doGenerate', {
    'ai.model.id': 'model-e', 'ai.model.provider': 'openai.chat',
    'ai.usage.promptTokens': 50, 'ai.usage.completionTokens': 9,
  }],
];

const OPENLLMETRY = ['openllmetry chat', {
  'gen_ai.request.model': 'model-f',
  'gen_ai.usage.input_tokens': 12, 'gen_ai.usage.output_tokens': 300,
  'gen_ai.usage.cache_read_input_tokens': 9000, 'llm.usage.total_tokens': 312,
}];

const five = await buildSpans(FIVE);
write('test/fixtures/five-dialects.otlp.json', JSON.stringify(toJson(five), null, 2) + '\n');

const mixed = await buildSpans([...FIVE, OPENLLMETRY]);
write('examples/mixed-dialects.otlp.json', JSON.stringify(toJson(mixed), null, 2) + '\n');

// JSON Lines, string intValue: two requests (3 + 2 spans), one per line.
const lines = [toJson(five.slice(0, 3)), toJson(five.slice(3))].map((d) => JSON.stringify(intsAsStrings(d)));
write('test/fixtures/five-dialects.jsonl', lines.join('\n') + '\n');

// Directory input: part1.json (numbers) + nested/part2.jsonl (strings) together equal the five spans.
write('test/fixtures/dir/part1.json', JSON.stringify(toJson(five.slice(0, 2)), null, 2) + '\n');
write('test/fixtures/dir/nested/part2.jsonl', JSON.stringify(intsAsStrings(toJson(five.slice(2)))) + '\n');

// Clean: spec-conformant spans plus a span that is not an LLM call.
const clean = await buildSpans([
  ['chat clean-a', {
    'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': 'anthropic', 'gen_ai.request.model': 'model-a',
    'gen_ai.usage.input_tokens': 100, 'gen_ai.usage.output_tokens': 20,
    'gen_ai.usage.cache_read.input_tokens': 30, 'gen_ai.usage.cache_creation.input_tokens': 10,
  }],
  ['chat clean-b', {
    'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': 'openai', 'gen_ai.request.model': 'model-b',
    'gen_ai.usage.input_tokens': 55, 'gen_ai.usage.output_tokens': 8,
  }],
  ['GET /health', { 'http.request.method': 'GET', 'http.response.status_code': 200 }],
]);
write('test/fixtures/clean.otlp.json', JSON.stringify(toJson(clean), null, 2) + '\n');

// Conflict (GSD004): standard and OpenInference values disagree on one span.
const conflict = await buildSpans([
  ['chat conflict', {
    'gen_ai.provider.name': 'anthropic', 'gen_ai.request.model': 'model-a',
    'gen_ai.usage.input_tokens': 100, 'gen_ai.usage.output_tokens': 20,
    'llm.token_count.prompt': 200, 'llm.token_count.completion': 20,
  }],
]);
write('test/fixtures/conflict.otlp.json', JSON.stringify(toJson(conflict), null, 2) + '\n');

// Total mismatch (GSD005): total does not match input + output.
const total = await buildSpans([
  ['chat total-mismatch', {
    'gen_ai.provider.name': 'anthropic', 'gen_ai.request.model': 'model-a',
    'gen_ai.usage.input_tokens': 10, 'gen_ai.usage.output_tokens': 5, 'llm.usage.total_tokens': 99,
  }],
]);
write('test/fixtures/total-mismatch.otlp.json', JSON.stringify(toJson(total), null, 2) + '\n');
