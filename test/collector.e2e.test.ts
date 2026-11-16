// AC-6 (Collector side): validate the generated config and re-audit what the Collector produces.
// Needs the otelcol-contrib binary (tested with 0.165.0). Set OTELCOL_BIN to its path; skipped otherwise.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cli, fixture, tmpDir } from './helpers.js';

const bin = process.env.OTELCOL_BIN;
const skip = !bin || !existsSync(bin) ? 'OTELCOL_BIN is not set (path to otelcol-contrib 0.165.0), skipping the Collector e2e test' : false;

const PIPELINE = (inGlob: string, outFile: string): string => `
receivers:
  otlp_json_file:
    include: [ "${inGlob}" ]
    start_at: beginning
exporters:
  file:
    path: ${outFile}
service:
  telemetry:
    metrics:
      level: none
  pipelines:
    traces:
      receivers: [otlp_json_file]
      processors: [transform/genai]
      exporters: [file]
`;

test('AC-6: generated config validates and the Collector output re-audits clean', { skip, timeout: 90_000 }, async () => {
  const dir = tmpDir('gsd-e2e-');
  mkdirSync(join(dir, 'in'));
  mkdirSync(join(dir, 'out'));
  copyFileSync(fixture('five-dialects.jsonl'), join(dir, 'in', 'five.jsonl'));
  const snippet = join(dir, 'snippet.yaml');
  const gen = cli([fixture('five-dialects.otlp.json'), '--emit-ottl', snippet, '--fail-on', 'none']);
  assert.equal(gen.code, 0, gen.stderr);
  const snippetText = readFileSync(snippet, 'utf8');
  const config = join(dir, 'collector.yaml');
  const outFile = join(dir, 'out', 'traces.jsonl');
  writeFileSync(config, snippetText + PIPELINE(join(dir, 'in', '*.jsonl'), outFile));

  const v = spawnSync(bin!, ['validate', `--config=${config}`], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stderr + v.stdout);

  // Run the Collector until the output file has content, then stop it.
  const child = spawn(bin!, [`--config=${config}`], { stdio: 'ignore' });
  try {
    const deadline = Date.now() + 40_000;
    let size = 0;
    while (Date.now() < deadline && size < 100) {
      await new Promise((r) => setTimeout(r, 500));
      size = existsSync(outFile) ? statSync(outFile).size : 0;
    }
    await new Promise((r) => setTimeout(r, 1500)); // let the exporter finish writing
  } finally {
    // Stop the Collector and wait for it to exit (SIGKILL fallback after 5 s).
    const exited = new Promise<void>((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', () => resolve())));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(timer);
  }

  const re = cli([outFile, '--format', 'json', '--fail-on', 'none']);
  const j = JSON.parse(re.stdout);
  assert.equal(j.summary.findings.GSD001, 0);
  assert.equal(j.summary.input.backend, 133431);
});
