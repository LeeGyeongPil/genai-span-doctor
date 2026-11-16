#!/usr/bin/env node
// Command line entry: argument parsing, language, run order and exit codes (0 ok, 1 findings, 2 usage/input error).
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runAudit } from './audit.js';
import { loadPrices, PricesError } from './cost.js';
import { LEVEL_ORDER, type Level } from './findings.js';
import { makeTranslator, resolveLang, type Lang, type Translator } from './i18n.js';
import { InputError, readSpans } from './otlp.js';
import { generateOttl } from './ottl.js';
import { buildJson } from './report/json.js';
import { buildSarif } from './report/sarif.js';
import { renderTable } from './report/table.js';
import { loadRules, wantedKeys } from './rules.js';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  env: Record<string, string | undefined>;
  stdin: () => string;
}

const FORMATS = ['table', 'json', 'sarif'] as const;
const FAIL_ON = ['error', 'warning', 'note', 'none'] as const;

function packageVersion(): string {
  const url = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as { version: string }).version;
}

/** Finds --lang in raw arguments so that even usage errors can be shown in the right language. */
function scanLang(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--lang') return argv[i + 1];
    if (a.startsWith('--lang=')) return a.slice('--lang='.length);
  }
  return undefined;
}

/** `--emit-ottl` takes an optional *.yaml/*.yml file; parseArgs has no optional values, so split it out first. */
function splitEmitOttl(argv: string[]): { argv: string[]; ottlFile?: string } {
  const out: string[] = [];
  let ottlFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('--emit-ottl=')) {
      ottlFile = a.slice('--emit-ottl='.length);
      out.push('--emit-ottl');
    } else if (a === '--emit-ottl' && /\.ya?ml$/i.test(argv[i + 1] ?? '')) {
      ottlFile = argv[i + 1];
      out.push('--emit-ottl');
      i++;
    } else {
      out.push(a);
    }
  }
  return ottlFile === undefined ? { argv: out } : { argv: out, ottlFile };
}

export function run(rawArgv: string[], io: Io): number {
  // Language first: --lang value may be invalid, in which case the environment decides the error language.
  const cliLangRaw = scanLang(rawArgv);
  const cliLang = cliLangRaw === 'en' || cliLangRaw === 'ko' ? cliLangRaw : undefined;
  const lang: Lang = resolveLang(cliLang, io.env);
  const t: Translator = makeTranslator(lang);
  const fail = (key: Parameters<Translator>[0], params: Record<string, string | number> = {}): number => {
    io.err(t(key, params) + '\n');
    return 2;
  };

  if (cliLangRaw !== undefined && cliLang === undefined) {
    return fail('err.badValue', { option: '--lang', value: String(cliLangRaw), allowed: 'en, ko' });
  }

  const { argv, ottlFile } = splitEmitOttl(rawArgv);
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: 'string' },
        backend: { type: 'string' },
        'emit-ottl': { type: 'boolean' },
        'ottl-delete-source': { type: 'boolean' },
        'assume-cache-excluded': { type: 'string' },
        prices: { type: 'string' },
        'fail-on': { type: 'string' },
        lang: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    return fail('err.unknownOption', { detail: (e as Error).message });
  }
  const v = parsed.values;
  const version = packageVersion();

  if (v.help) {
    io.out(t('help.text') + '\n');
    return 0;
  }
  if (v.version) {
    io.out(version + '\n');
    return 0;
  }

  const format = v.format ?? 'table';
  if (!(FORMATS as readonly string[]).includes(format)) {
    return fail('err.badValue', { option: '--format', value: format, allowed: FORMATS.join(', ') });
  }
  const failOn = v['fail-on'] ?? 'error';
  if (!(FAIL_ON as readonly string[]).includes(failOn)) {
    return fail('err.badValue', { option: '--fail-on', value: failOn, allowed: FAIL_ON.join(', ') });
  }

  const positionals = parsed.positionals;
  if (positionals.length === 0) return fail('err.noInput');
  if (positionals.length > 1) return fail('err.tooManyInputs', { count: positionals.length, list: positionals.join(' ') });
  const input = positionals[0] as string;

  const rules = loadRules();
  const backendName = v.backend ?? rules.backends.default;
  if (!rules.backends.backends[backendName]) {
    return fail('err.badValue', { option: '--backend', value: backendName, allowed: Object.keys(rules.backends.backends).join(', ') });
  }
  const dialectIds = rules.dialects.dialects.map((d) => d.id);
  const assume = new Set<string>();
  for (const id of (v['assume-cache-excluded'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!dialectIds.includes(id)) return fail('err.badDialect', { value: id, allowed: dialectIds.join(', ') });
    assume.add(id);
  }

  let prices;
  if (v.prices !== undefined) {
    try {
      prices = loadPrices(v.prices);
    } catch (e) {
      if (e instanceof PricesError) return fail('err.prices', { path: e.path, detail: e.detail });
      throw e;
    }
  }

  let read;
  try {
    read = readSpans(input, wantedKeys(rules), io.stdin);
  } catch (e) {
    if (e instanceof InputError) {
      const key = ({ readFile: 'err.readFile', badJson: 'err.badJson', notOtlp: 'err.notOtlp', emptyDir: 'err.emptyDir' } as const)[e.code];
      return fail(key, { path: e.path, detail: e.detail });
    }
    throw e;
  }

  const result = runAudit(read.spans, rules, {
    backendName,
    assumeCacheExcluded: assume,
    ...(prices ? { prices } : {}),
    files: read.files,
    t,
  });

  let report: string;
  if (format === 'json') report = JSON.stringify(buildJson(result, { version, lang, inputs: read.files, skipped: read.skipped }), null, 2) + '\n';
  else if (format === 'sarif') report = JSON.stringify(buildSarif(result, version, t, read.skipped), null, 2) + '\n';
  else report = renderTable(result, t, read.skipped);

  // With --emit-ottl and no file, stdout is reserved for the YAML so it can be piped into a file.
  const ottlToStdout = v['emit-ottl'] === true && ottlFile === undefined;
  (ottlToStdout ? io.err : io.out)(report);

  if (v['emit-ottl']) {
    const ottl = generateOttl(result.analyses, { rules, t, version, deleteSource: v['ottl-delete-source'] === true, assumeCacheExcluded: assume });
    if (ottl.statements.length === 0) {
      io.err(t('note.ottlNothing') + '\n');
    } else if (ottlFile === undefined) {
      io.out(ottl.yaml);
    } else {
      try {
        writeFileSync(ottlFile, ottl.yaml);
      } catch (e) {
        return fail('err.writeFile', { path: ottlFile, detail: (e as Error).message });
      }
      io.err(t('note.ottlWritten', { path: ottlFile }) + '\n');
    }
  }

  if (failOn === 'none') return 0;
  const threshold = LEVEL_ORDER[failOn as Level];
  return result.findings.some((f) => LEVEL_ORDER[f.level] >= threshold) ? 1 : 0;
}

function main(): void {
  const code = run(process.argv.slice(2), {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    env: process.env,
    stdin: () => readFileSync(0, 'utf8'),
  });
  process.exitCode = code;
}

// Run only when executed as a script, not when imported by tests.
// realpath so that an npm bin symlink still matches this module's real path.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
