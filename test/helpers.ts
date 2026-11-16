// Shared test helpers: repo paths, in-process CLI runner, real-process runner.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { run } from '../src/cli.js';

/** Repo root, resolved from dist/test/. */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const fixture = (name: string): string => join(ROOT, 'test', 'fixtures', name);
export const example = (name: string): string => join(ROOT, 'examples', name);
export const CLI_JS = join(ROOT, 'dist', 'src', 'cli.js');

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with an explicit environment (default: English, nothing inherited). */
export function cli(args: string[], env: Record<string, string> = { LANG: 'en_US.UTF-8' }, stdin = ''): CliResult {
  let stdout = '';
  let stderr = '';
  const code = run(args, {
    out: (s) => (stdout += s),
    err: (s) => (stderr += s),
    env,
    stdin: () => stdin,
  });
  return { code, stdout, stderr };
}

/** Runs the compiled CLI as a real child process. */
export function cliProcess(args: string[], env: Record<string, string> = { LANG: 'en_US.UTF-8' }, input?: string): CliResult {
  const r = spawnSync(process.execPath, [CLI_JS, ...args], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    ...(input !== undefined ? { input } : {}),
  });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

export function json(args: string[]): Record<string, any> {
  const r = cli([...args, '--format', 'json', '--fail-on', 'none']);
  return JSON.parse(r.stdout) as Record<string, any>;
}

const tempDirs: string[] = [];
process.on('exit', () => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

/** Creates a temp folder that is removed when the test process exits. */
export function tmpDir(prefix = 'gsd-'): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}
