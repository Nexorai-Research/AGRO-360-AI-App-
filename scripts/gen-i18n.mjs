// Converts the web app's translation files into JSON for the mobile app. Reads the backend repo, never writes to it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = process.env.AGRO_WEB_DIR ?? '/home/password/AGRO-360-AI/apps/web';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');
mkdirSync(out, { recursive: true });

const source = JSON.parse(readFileSync(join(WEB, 'i18n', 'source.json'), 'utf8'));
for (const lang of ['hi', 'mr']) {
  const text = readFileSync(join(WEB, 'src', 'i18n', `${lang}.js`), 'utf8');
  const D = new Function(`${text.replace(/export\s+const\s+D\s*=/, 'const D =')}\nreturn D;`)();
  // Only phrases that exist in the English source and have a translation are kept.
  const keep = Object.fromEntries(
    source.filter((k) => typeof D[k] === 'string' && D[k] !== '').map((k) => [k, D[k]]),
  );
  writeFileSync(join(out, `web-${lang}.json`), `${JSON.stringify(keep, null, 1)}\n`);
  console.log(`${lang}: ${Object.keys(keep).length} of ${source.length} phrases`);
}
