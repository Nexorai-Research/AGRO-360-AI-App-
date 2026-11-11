import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import webHi from './locales/web-hi.json';
import webMr from './locales/web-mr.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
] as const;
export type LangCode = (typeof LANGUAGES)[number]['code'];

const LANG_KEY = 'agro360.lang';
// Phrases of the web app, keyed by their English text ("{0}" placeholders). English is the key itself.
const WEB: Record<string, Record<string, string>> = { hi: webHi, mr: webMr };

const i18next = createInstance();
const isLang = (v: unknown): v is LangCode => LANGUAGES.some((l) => l.code === v);

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, mr: { translation: mr } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export const i18n = i18next;
export const currentLanguage = (): LangCode => (isLang(i18next.language) ? i18next.language : 'en');

/** Picks the saved language, else the phone language when supported, else English. */
export async function initI18n(): Promise<LangCode> {
  let lang: LangCode = 'en';
  try {
    const saved = await SecureStore.getItemAsync(LANG_KEY);
    const device = getLocales()[0]?.languageCode;
    lang = isLang(saved) ? saved : isLang(device) ? device : 'en';
  } catch {
    lang = 'en';
  }
  await i18next.changeLanguage(lang);
  return lang;
}

export async function setLanguage(lang: LangCode): Promise<void> {
  const next = isLang(lang) ? lang : 'en';
  await i18next.changeLanguage(next);
  try {
    await SecureStore.setItemAsync(LANG_KEY, next);
  } catch {
    /* the choice just is not remembered */
  }
}

/** Translate a web-app phrase by its English text and fill {0}, {1}. Falls back to English. */
export function tw(phrase: string, ...args: (string | number)[]): string {
  const text = WEB[currentLanguage()]?.[phrase] ?? phrase;
  return text.replace(/\{(\d+)\}/g, (m, i: string) =>
    args[Number(i)] === undefined ? m : String(args[Number(i)]),
  );
}
