// Terminal table and summary. No colors, so output is stable in logs and README captures.
import type { AuditResult } from '../audit.js';
import { RULE_IDS } from '../findings.js';
import type { Translator } from '../i18n.js';

// Thousands separators by regex: toLocaleString is slow when called hundreds of thousands of times.
const fmt = (n: number): string => (Number.isInteger(n) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : n.toLocaleString('en-US'));

/** Display width: East Asian wide characters take two columns. */
function width(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ? 2 : 1;
  }
  return w;
}

const pad = (s: string, w: number, right = false): string => (right ? ' '.repeat(Math.max(0, w - width(s))) + s : s + ' '.repeat(Math.max(0, w - width(s))));

function truncate(s: string, max: number): string {
  if (width(s) <= max) return s;
  let out = '';
  for (const ch of s) {
    if (width(out + ch) > max - 1) break;
    out += ch;
  }
  return out + '…';
}

function renderGrid(headers: string[], rows: string[][], numeric: boolean[]): string[] {
  // Loop instead of Math.max(...rows) so very large row counts cannot overflow the call stack.
  const widths = headers.map((h) => width(h));
  for (const row of rows) {
    for (let i = 0; i < widths.length; i++) widths[i] = Math.max(widths[i] ?? 0, width(row[i] ?? ''));
  }
  const line = (cells: string[]): string => cells.map((c, i) => pad(c, widths[i] ?? 0, numeric[i] ?? false)).join('  ').trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
}

export function renderTable(r: AuditResult, t: Translator, skipped: string[] = []): string {
  const out: string[] = [];
  const s = r.summary;
  if (r.analyses.length > 0) {
    const headers = [t('col.span'), t('col.dialect'), t('col.inSeen'), t('col.inNorm'), t('col.outSeen'), t('col.outNorm'), t('col.cache'), t('col.findings')];
    // Group finding ids by span once, so each row is an O(1) lookup.
    const key = (file: string, traceId: string, spanId: string, name: string): string => [file, traceId, spanId, name].join('\u0000');
    const byKey = new Map<string, string[]>();
    for (const f of r.findings) {
      if (f.spanName === '') continue;
      const k = key(f.file, f.traceId, f.spanId, f.spanName);
      const list = byKey.get(k);
      if (list) list.push(f.ruleId);
      else byKey.set(k, [f.ruleId]);
    }
    const rows = r.analyses.map((a) => {
      const ids = byKey.get(key(a.span.file, a.span.traceId, a.span.spanId, a.span.name)) ?? [];
      return [
        truncate(a.span.name || '(unnamed)', 28),
        a.dialects.join('+'),
        fmt(a.backend.input ?? 0),
        fmt(a.normalized.input),
        fmt(a.backend.output ?? 0),
        fmt(a.normalized.output),
        `${fmt(a.normalized.cacheRead)}/${fmt(a.normalized.cacheWrite)}`,
        [...new Set(ids)].join(',') || '-',
      ];
    });
    out.push(...renderGrid(headers, rows, [false, false, true, true, true, true, true, false]));
    out.push('');
  }

  if (r.findings.length > 0) {
    out.push(t('findings.title'));
    for (const f of r.findings) {
      const where = f.spanName ? `${f.spanName}` : f.file;
      out.push(`  ${f.ruleId} ${t(`level.${f.level}`)}  ${where}: ${f.message}`);
    }
    out.push('');
    for (const id of RULE_IDS) {
      if ((s.findings[id] ?? 0) === 0) continue;
      out.push(`  ${id}  ${t(`rule.${id}.short` as 'rule.GSD001.short')}`);
      out.push(`         ${t(`rule.${id}.help` as 'rule.GSD001.help')}`);
    }
    out.push('');
  }

  for (const f of skipped) out.push(t('note.skipped', { path: f }));
  if (skipped.length > 0) out.push('');

  out.push(t('summary.title'));
  out.push(`  ${t('summary.spans', { llm: s.llmSpans, total: s.spans, files: s.files, backend: r.backendName })}`);
  if (s.llmSpans === 0) {
    out.push(`  ${t('summary.noLlmSpans')}`);
    return out.join('\n') + '\n';
  }
  out.push(`  ${t('summary.dialects', { list: Object.entries(s.dialects).map(([k, v]) => `${k} x${v}`).join(', ') })}`);
  out.push(`  ${t('summary.input', { seen: fmt(s.input.backend), normalized: fmt(s.input.normalized) })}`);
  out.push(`  ${t('summary.output', { seen: fmt(s.output.backend), normalized: fmt(s.output.normalized) })}`);
  if (s.cost) out.push(`  ${t('summary.cost', { seen: s.cost.backend.toFixed(6), normalized: s.cost.normalized.toFixed(6) })}`);
  if (s.findings.total === 0) {
    out.push(`  ${t('summary.noFindings')}`);
  } else {
    const list = RULE_IDS.filter((id) => s.findings[id] > 0).map((id) => `${id} x${s.findings[id]}`).join(', ');
    out.push(`  ${t('summary.findings', { list })}`);
  }
  return out.join('\n') + '\n';
}
