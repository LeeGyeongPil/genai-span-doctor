# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-16

### Changed
- Directory mode now skips JSON files that are not OTLP trace exports (no `resourceSpans`) instead of stopping with exit code 2. Skipped files are shown as `Skipped: <file>` in the table, as a top-level `skipped` array in `--format json` and as `runs[0].properties.skipped` in SARIF. The exit code now depends only on the audited files; it is 2 only when no OTLP file is left. CI jobs that relied on exit 2 for stray JSON files in a directory will now see 0 or 1. Single non-OTLP files and stdin still exit 2.

## [0.1.0] - 2026-11-16

### Added
- Offline audit of OTLP JSON, JSON Lines (Collector file exporter), directories and stdin.
- Detection of six token-attribute dialects: OpenTelemetry GenAI (current and deprecated names), OpenInference, Vercel AI SDK, OpenLLMetry and flat non-standard keys.
- Normalization to the spec meaning (input includes cache read and write tokens) with a cache greater than input heuristic and `--assume-cache-excluded`.
- Findings GSD001 to GSD006 with `table`, `json` (schemaVersion 1) and `sarif` (2.1.0) output and `--fail-on` exit codes.
- Backend views `otel`, `langfuse` and `phoenix` defined in `data/backends.json`.
- `--emit-ottl` Collector transform snippet generation with nil guards and optional `--ottl-delete-source`.
- `--prices` cost preview from user-supplied per-1M-token prices.
- English and Korean screen language (`--lang`, `GENAI_SPAN_DOCTOR_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`).
- Rule tables with source URLs and checked dates, verified against the official attribute constants in tests.

[Unreleased]: https://github.com/LeeGyeongPil/genai-span-doctor/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/LeeGyeongPil/genai-span-doctor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/LeeGyeongPil/genai-span-doctor/releases/tag/v0.1.0
