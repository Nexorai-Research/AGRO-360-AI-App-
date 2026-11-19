// Web parity phase 15: the 19 other languages of the web (the 22 scheduled languages of India; Hindi and Marathi are done by hand).
// Reads the web app's translations (read only) and writes src/i18n/locales/<lang>.json with every app text whose English matches a
// web phrase, plus the hand-written core texts in i18n-parts/langs-core.json. Everything else falls back to English at run time.
// Prints the coverage per language, which goes into docs/TRACKER.md.
//   AGRO_WEB_DIR=<web repo>/apps/web node scripts/gen-langs.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = process.env.AGRO_WEB_DIR ?? '/home/password/AGRO-360-AI/apps/web';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const locales = join(root, 'src', 'i18n', 'locales');
export const EXTRA = [
  'bn',
  'te',
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
];

const load = (file, names) => {
  const text = readFileSync(file, 'utf8')
    .replace(/^\s*import .*$/gm, '')
    .replace(/export\s+const\s+/g, 'const ');
  return new Function(`${text}\nreturn { ${names.join(', ')} };`)();
};
const shell = load(join(WEB, 'src', 'i18n-data.js'), ['LANGS', 'TRANSLATIONS']);
const phrases = (lang) => {
  const map = { ...(load(join(WEB, 'src', 'i18n', `${lang}.js`), ['D']).D ?? {}) };
  for (const [k, v] of Object.entries(shell.TRANSLATIONS[lang] ?? {}))
    if (typeof v === 'string' && v) map[k] = v;
  return map;
};

const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out);
    else if (typeof v === 'string') out[key] = v;
  }
  return out;
};
const nest = (pairs) => {
  const o = {};
  for (const [path, v] of pairs) {
    const ks = path.split('.');
    let cur = o;
    for (const k of ks.slice(0, -1)) cur = cur[k] ??= {};
    cur[ks.at(-1)] = v;
  }
  return o;
};

/** "{{name}} owes {{amount}}" is the web's "{0} owes {1}"; the answer gets the app's placeholders back. */
function lookup(map, en) {
  const names = [...en.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  let i = 0;
  const web = en.replace(/\{\{\s*\w+\s*\}\}/g, () => `{${i++}}`);
  const tries = [web, web.replace(/\.$/, ''), `${web}.`];
  for (const w of tries) {
    const hit = map[w];
    if (typeof hit !== 'string' || !hit) continue;
    const back = hit.replace(/\{(\d+)\}/g, (m, n) => (names[Number(n)] ? `{{${names[Number(n)]}}}` : m));
    // a translation that lost a placeholder would show wrong figures: skip it
    if (names.every((n) => back.includes(`{{${n}}}`)))
      return w === web
        ? back
        : en.endsWith('.') && !back.endsWith('.') && !/[।॥]$/.test(back)
          ? `${back}.`
          : back;
  }
  return null;
}

const en = flat(JSON.parse(readFileSync(join(locales, 'en.json'), 'utf8')));
const corePath = join(root, 'i18n-parts', 'langs-core.json');
const core = existsSync(corePath) ? JSON.parse(readFileSync(corePath, 'utf8')) : {};
const total = Object.keys(en).length;
const report = [];
for (const lang of EXTRA) {
  const map = phrases(lang);
  const pairs = [];
  let auto = 0;
  let hand = 0;
  for (const [k, v] of Object.entries(en)) {
    const h = core[lang]?.[k];
    if (typeof h === 'string' && h) {
      pairs.push([k, h]);
      hand++;
      continue;
    }
    const tr = lookup(map, v);
    if (tr && tr !== v) {
      pairs.push([k, tr]);
      auto++;
    }
  }
  writeFileSync(join(locales, `${lang}.json`), `${JSON.stringify(nest(pairs))}\n`);
  report.push({ lang, auto, hand, pct: Math.round(((auto + hand) / total) * 100) });
}
const names = Object.fromEntries(shell.LANGS);
writeFileSync(
  join(locales, 'langs.json'),
  `${JSON.stringify({ names, rtl: ['ur', 'ks'], coverage: Object.fromEntries(report.map((r) => [r.lang, r.pct])) }, null, 1)}\n`,
);
console.log(`app texts: ${total}`);
for (const r of report)
  console.log(`${r.lang.padEnd(4)} ${String(r.pct).padStart(3)}%  web ${r.auto}  core ${r.hand}`);
