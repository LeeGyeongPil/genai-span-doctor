// English messages. Every key must also exist in ko.ts (checked at compile time and in test/i18n.test.ts).
export const en = {
  'help.text': `Usage: genai-span-doctor <file|dir|-> [options]

Audit exported OTLP JSON traces for LLM token-attribute dialects, cache-inclusive
token semantics and backend visibility. Offline: reads files only, no network.

Input:
  <file>   OTLP JSON (ExportTraceServiceRequest) or JSON Lines (Collector file exporter)
  <dir>    every *.json and *.jsonl file below the directory
  -        read standard input

Options:
  --format table|json|sarif        report format (default: table)
  --backend otel|langfuse|phoenix  backend view used for the "0 tokens" check (default: otel)
  --emit-ottl [file.yaml]          write a Collector transform (OTTL) snippet; with no file the
                                   snippet goes to stdout and the report to stderr
  --ottl-delete-source             also delete the source attributes after copying
  --assume-cache-excluded <ids>    comma-separated dialect ids whose input excludes cache tokens
  --prices <file>                  per-1M-token prices JSON; adds a cost comparison
  --fail-on error|warning|note|none  exit 1 when a finding at this level or above exists (default: error)
  --lang en|ko                     screen language (default: GENAI_SPAN_DOCTOR_LANG, then LC_ALL, LC_MESSAGES, LANG)
  --help, -h                       show this help
  --version, -v                    show the version

Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or input error.

Dialect ids: otel-genai, openllmetry, otel-genai-deprecated, openinference, vercel-ai, flat`,

  'level.error': 'error',
  'level.warning': 'warning',
  'level.note': 'note',

  'col.span': 'Span',
  'col.dialect': 'Dialect',
  'col.inSeen': 'Input seen',
  'col.inNorm': 'Input normalized',
  'col.outSeen': 'Output seen',
  'col.outNorm': 'Output normalized',
  'col.cache': 'Cache read/write',
  'col.findings': 'Findings',

  'summary.title': 'Summary',
  'summary.spans': '{llm} LLM spans of {total} spans in {files} file(s); backend view: {backend}',
  'summary.dialects': 'Dialects: {list}',
  'summary.input': 'Input tokens:  {seen} seen by the backend / {normalized} normalized',
  'summary.output': 'Output tokens: {seen} seen by the backend / {normalized} normalized',
  'summary.cost': 'Cost (your prices): {seen} seen by the backend / {normalized} normalized',
  'summary.findings': 'Findings: {list}',
  'summary.noFindings': 'Findings: none',
  'summary.noLlmSpans': 'No spans with token-usage attributes were found. Check the input path and the attribute names.',
  'findings.title': 'Findings',

  'rule.GSD001.short': 'Backend cannot read token usage',
  'rule.GSD001.help': 'The span carries usage under attribute names the selected backend does not read, so it shows 0 tokens. Copy the values to the standard gen_ai.usage.* names (see --emit-ottl).',
  'rule.GSD002.short': 'Deprecated attribute',
  'rule.GSD002.help': 'Rename the attribute to its replacement in the instrumentation or in a Collector transform.',
  'rule.GSD003.short': 'Cache tokens exceed input; input likely excludes cache',
  'rule.GSD003.help': 'A spec-style input count includes cache read and write tokens. When the cache total is larger than the input, the input value probably excludes the cache, so cost and token totals are under-counted. Add the cache tokens to the input (see --emit-ottl).',
  'rule.GSD004.short': 'Dialects disagree on a value',
  'rule.GSD004.help': 'Two attribute sets on one span give different values after normalization. Decide which instrumentation is right and drop or fix the other.',
  'rule.GSD005.short': 'Total differs from input plus output',
  'rule.GSD005.help': 'The reported total does not match input + output (raw or normalized). Check whether the instrumentation counts cache or reasoning tokens in the total.',
  'rule.GSD006.short': 'Mixed dialects in one file',
  'rule.GSD006.help': 'Several attribute dialects appear in the same file. Normalize them in one place, for example with a Collector transform.',

  'finding.GSD001': 'Backend "{backend}" cannot read this span\'s {what}; it will show 0 tokens. Found: {found}. Expected one of: {expected}.',
  'finding.GSD001.input': 'input tokens',
  'finding.GSD001.output': 'output tokens',
  'finding.GSD001.both': 'input and output tokens',
  'finding.GSD002': 'Deprecated attribute(s): {list}.',
  'finding.GSD003': 'Cache tokens ({cache}) exceed input ({input}) in {dialect}: input likely excludes cache, so usage is under-counted. Normalized input: {normalized}.',
  'finding.GSD004': 'Dialects disagree on {what}: {a} gives {va}, {b} gives {vb}.',
  'finding.GSD004.input': 'input tokens (normalized)',
  'finding.GSD004.output': 'output tokens',
  'finding.GSD005': 'Total {total} ({key}) differs from input + output = {sum} (normalized: {nsum}).',
  'finding.GSD006': '{count} dialects mixed in this file: {list}.',

  'err.noInput': 'No input given. Pass an OTLP JSON file, a directory or "-" for stdin, e.g. genai-span-doctor traces.json',
  'err.tooManyInputs': 'Only one input is accepted but got {count}: {list}. Pass a directory to audit several files.',
  'err.unknownOption': 'Unknown option or bad usage: {detail}. Run with --help to see the options.',
  'err.badValue': 'Invalid value "{value}" for {option}. Allowed: {allowed}.',
  'err.badDialect': 'Unknown dialect id "{value}" in --assume-cache-excluded. Allowed: {allowed}.',
  'err.readFile': 'Cannot read {path}: {detail}. Check that the path exists and is readable.',
  'err.badJson': 'Invalid JSON in {path}: {detail}. Export traces as OTLP JSON or JSON Lines.',
  'err.notOtlp': '{path} is not an OTLP traces file: {detail}. Expected {"resourceSpans": [...]}.',
  'err.emptyDir': 'No trace files in {path}: {detail}. Put *.json or *.jsonl OTLP exports there.',
  'err.prices': 'Invalid prices file {path}: {detail}. Expected {"default": {"input": 3, "output": 15}}; see examples/prices.example.json.',
  'err.writeFile': 'Cannot write {path}: {detail}.',

  'note.ottlWritten': 'Wrote Collector transform snippet to {path}',
  'note.skipped': 'Skipped: {path} (not an OTLP traces file)',
  'note.ottlNothing': 'No statements needed: every observed span already uses the standard attribute names.',

  'ottl.header': 'Generated by genai-span-doctor {version}. Review before deploying; add transform/genai to the processors of your traces pipeline.',
  'ottl.phase.cache': 'Step 1: copy cache attributes to the standard names',
  'ottl.phase.sum': 'Step 2: input sums (cache tokens are added where the source input excludes them)',
  'ottl.phase.copy': 'Step 3: copy remaining usage attributes to the standard names',
  'ottl.phase.delete': 'Step 4: delete the source attributes (--ottl-delete-source)',
} as const;

export type MessageKey = keyof typeof en;
