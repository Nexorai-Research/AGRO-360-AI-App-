import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import webHi from './locales/web-hi.json';
import webMr from './locales/web-mr.json';
// web parity 15: the other languages of the web (scripts/gen-langs.mjs). Each holds only the texts it translates; the rest is English.
import as from './locales/as.json';
import bn from './locales/bn.json';
import brx from './locales/brx.json';
import doi from './locales/doi.json';
import gu from './locales/gu.json';
import kn from './locales/kn.json';
import kok from './locales/kok.json';
import ks from './locales/ks.json';
import mai from './locales/mai.json';
import ml from './locales/ml.json';
import mni from './locales/mni.json';
import ne from './locales/ne.json';
import or from './locales/or.json';
import pa from './locales/pa.json';
import sa from './locales/sa.json';
import sat from './locales/sat.json';
import sd from './locales/sd.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import ur from './locales/ur.json';
import langs from './locales/langs.json';

const CODES = [
  'en',
  'hi',
  'bn',
  'te',
  'mr',
  'ta',
  'ur',
  'gu',
  'kn',
  'ml',
  'or',
  'pa',
  'as',
  'mai',
  'sat',
  'ks',
  'ne',
  'sd',
  'kok',
  'doi',
  'mni',
  'brx',
  'sa',
] as const;
export type LangCode = (typeof CODES)[number];
/** English and the 22 scheduled languages of India, in the web's order, each named in its own script. */
export const LANGUAGES: readonly { code: LangCode; label: string }[] = CODES.map((code) => ({
  code,
  label: (langs.names as Record<string, string>)[code] ?? code,
}));
/** Written right to left (Urdu, Kashmiri). */
export const RTL_LANGS: readonly string[] = langs.rtl;
/** Share of the app's texts translated, per added language (the rest shows in English). */
export const COVERAGE = langs.coverage as Record<string, number>;

const LANG_KEY = 'agro360.lang';
// Phrases of the web app, keyed by their English text ("{0}" placeholders). English is the key itself.
const WEB: Record<string, Record<string, string>> = { hi: webHi, mr: webMr };

const i18next = createInstance();
const isLang = (v: unknown): v is LangCode => LANGUAGES.some((l) => l.code === v);

void i18next.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries({
      en,
      hi,
      mr,
      as,
      bn,
      brx,
      doi,
      gu,
      kn,
      kok,
      ks,
      mai,
      ml,
      mni,
      ne,
      or,
      pa,
      sa,
      sat,
      sd,
      ta,
      te,
      ur,
    }).map(([code, translation]) => [code, { translation }]),
  ),
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
