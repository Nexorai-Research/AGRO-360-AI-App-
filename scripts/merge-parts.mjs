// Merges i18n-parts/stepN.json into src/i18n/locales/{en,hi,mr}.json, adds a quick link for every new nav key, and appends
// docs/tracker-parts/stepN.md to docs/TRACKER.md. Safe to run again: existing keys are overwritten with the same values and links are not duplicated.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const langs = ['en', 'hi', 'mr'];
const files = readdirSync('i18n-parts').filter((f) => /^step\d+\.json$/.test(f)).sort();
const routeOf = Object.assign({}, ...readdirSync('scripts').filter((f) => /^nav-routes.*\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(`scripts/${f}`, 'utf8'))));
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const deep = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a?.[k]) ? deep(a[k], v) : v; return o; };
for (const l of langs) {
  const p = `src/i18n/locales/${l}.json`;
  const d = JSON.parse(readFileSync(p, 'utf8'));
  for (const f of files) {
    const part = JSON.parse(readFileSync(`i18n-parts/${f}`, 'utf8'))[l] ?? {};
    for (const [k, v] of Object.entries(part)) d[k] = deep(d[k] ?? {}, v);
  }
  writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
}
const navKeys = new Set();
for (const f of files) Object.keys(JSON.parse(readFileSync(`i18n-parts/${f}`, 'utf8')).en.nav ?? {}).forEach((k) => navKeys.add(k));
let q = readFileSync('src/features/home/QuickLinks.tsx', 'utf8');
for (const k of navKeys) {
  const route = routeOf[k];
  if (!route) { console.log(`no route known for nav.${k}`); continue; }
  const line = `  ['nav.${k}', '${route}'],\n`;
  if (!q.includes(`'nav.${k}'`)) q = q.replace('] as const;', `${line}] as const;`);
}
writeFileSync('src/features/home/QuickLinks.tsx', q);
let t = readFileSync('docs/TRACKER.md', 'utf8');
for (const f of readdirSync('docs/tracker-parts').sort()) {
  const body = readFileSync(`docs/tracker-parts/${f}`, 'utf8');
  if (!t.includes(body.trim().slice(0, 80))) t += `\n${body.trim()}\n`;
}
writeFileSync('docs/TRACKER.md', t);
console.log('merged', files.join(', '), 'nav keys:', [...navKeys].join(', '));
