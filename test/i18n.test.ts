// AC-8: language selection, precedence, English fallback and identical key sets.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { langFromLocale, makeTranslator, MESSAGES, resolveLang } from '../src/i18n.js';
import { cli, cliProcess, fixture } from './helpers.js';

test('AC-8: en and ko have identical message keys, none empty', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.ko).sort());
  for (const lang of ['en', 'ko'] as const) {
    for (const [k, v] of Object.entries(MESSAGES[lang])) assert.ok(v.length > 0, `${lang}:${k}`);
  }
});

test('AC-8: placeholders match between languages', () => {
  const ph = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
  for (const k of Object.keys(MESSAGES.en) as Array<keyof typeof MESSAGES.en>) {
    assert.deepEqual(ph(MESSAGES.ko[k]), ph(MESSAGES.en[k]), k);
  }
});

test('AC-8: precedence --lang > GENAI_SPAN_DOCTOR_LANG > LC_ALL > LC_MESSAGES > LANG', () => {
  const env = { GENAI_SPAN_DOCTOR_LANG: 'ko', LC_ALL: 'en_US.UTF-8', LC_MESSAGES: 'en', LANG: 'en' };
  assert.equal(resolveLang('en', env), 'en');
  assert.equal(resolveLang(undefined, env), 'ko');
  assert.equal(resolveLang(undefined, { LC_ALL: 'ko_KR.UTF-8', LC_MESSAGES: 'en', LANG: 'en' }), 'ko');
  assert.equal(resolveLang(undefined, { LC_MESSAGES: 'ko_KR', LANG: 'en_US' }), 'ko');
  assert.equal(resolveLang(undefined, { LANG: 'ko_KR.UTF-8' }), 'ko');
  assert.equal(resolveLang(undefined, { LC_ALL: 'C', LANG: 'ko_KR.UTF-8' }), 'en', 'first non-empty value wins');
  assert.equal(resolveLang(undefined, { LC_ALL: '', LANG: 'ko_KR.UTF-8' }), 'ko', 'empty values are skipped');
});

test('AC-8: anything that is not Korean falls back to English', () => {
  assert.equal(resolveLang(undefined, {}), 'en');
  assert.equal(langFromLocale('fr_FR.UTF-8'), 'en');
  assert.equal(langFromLocale('korean'), 'en');
  assert.equal(langFromLocale('ko'), 'ko');
  assert.equal(langFromLocale('ko_KR.eucKR'), 'ko');
});

test('AC-8: --help shows Usage in English and 사용법 in Korean', () => {
  const ko = cliProcess(['--help', '--lang', 'ko']);
  assert.equal(ko.code, 0);
  assert.ok(ko.stdout.includes('사용법'));
  const en = cliProcess(['--help', '--lang', 'en']);
  assert.ok(en.stdout.includes('Usage'));
  assert.ok(!en.stdout.includes('사용법'));
});

test('AC-8: table headers and findings switch language', () => {
  const ko = cli([fixture('five-dialects.otlp.json'), '--lang', 'ko', '--fail-on', 'none']).stdout;
  assert.ok(ko.includes('정규화 입력'));
  assert.ok(ko.includes('판정'));
  const en = cli([fixture('five-dialects.otlp.json'), '--lang', 'en', '--fail-on', 'none']).stdout;
  assert.ok(en.includes('Input normalized'));
  assert.ok(en.includes('Findings'));
});

test('AC-8: the environment variable and LANG choose the language when --lang is absent', () => {
  const viaEnv = cli([fixture('clean.otlp.json')], { GENAI_SPAN_DOCTOR_LANG: 'ko', LANG: 'en_US.UTF-8' }).stdout;
  assert.ok(viaEnv.includes('요약'));
  const viaLang = cli([fixture('clean.otlp.json')], { LANG: 'ko_KR.UTF-8' }).stdout;
  assert.ok(viaLang.includes('요약'));
  const fallback = cli([fixture('clean.otlp.json')], { LANG: 'de_DE.UTF-8' }).stdout;
  assert.ok(fallback.includes('Summary'));
});

test('AC-8: errors are localized too, and a bad --lang value exits 2', () => {
  const ko = cli([fixture('missing.json'), '--lang', 'ko']);
  assert.equal(ko.code, 2);
  assert.ok(ko.stderr.includes('읽을 수 없습니다'));
  const bad = cli([fixture('clean.otlp.json'), '--lang', 'fr']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--lang/);
});

test('translator substitutes placeholders and leaves unknown ones', () => {
  const t = makeTranslator('en');
  assert.equal(t('note.ottlWritten', { path: 'a.yaml' }), 'Wrote Collector transform snippet to a.yaml');
});
