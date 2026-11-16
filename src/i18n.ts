// Language resolution and message lookup. All user-visible text lives in src/locales/.
import { en, type MessageKey } from './locales/en.js';
import { ko } from './locales/ko.js';

export type Lang = 'en' | 'ko';
export type { MessageKey };

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, ko };

/** Maps a locale string such as "ko_KR.UTF-8" to a supported language; anything else is English. */
export function langFromLocale(value: string): Lang {
  return /^ko([_.@-]|$)/i.test(value.trim()) ? 'ko' : 'en';
}

/**
 * Precedence: --lang > GENAI_SPAN_DOCTOR_LANG > LC_ALL > LC_MESSAGES > LANG.
 * The first non-empty value decides; a value that is not Korean means English.
 */
export function resolveLang(cliLang: string | undefined, env: Record<string, string | undefined>): Lang {
  const candidates = [cliLang, env.GENAI_SPAN_DOCTOR_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const c of candidates) {
    if (c !== undefined && c.trim() !== '') return langFromLocale(c);
  }
  return 'en';
}

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Returns a translator that substitutes {name} placeholders. */
export function makeTranslator(lang: Lang): Translator {
  const table = MESSAGES[lang];
  return (key, params = {}) =>
    table[key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
