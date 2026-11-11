// Generates src/api/schema.d.ts from the backend OpenAPI file.
// Usage: OPENAPI_URL=https://host/api/v1/openapi.json npm run gen:api
//    or: npm run gen:api -- --file path/to/openapi.json
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const i = process.argv.indexOf('--file');
const file = i > -1 ? process.argv[i + 1] : undefined;
const source = file ?? process.env.OPENAPI_URL;

if (!source) {
  console.error('No OpenAPI source. Set OPENAPI_URL (for example https://<host>/api/v1/openapi.json) or pass --file <path>.');
  process.exit(1);
}
if (file && !existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const r = spawnSync('npx', ['openapi-typescript', source, '-o', 'src/api/schema.d.ts'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
