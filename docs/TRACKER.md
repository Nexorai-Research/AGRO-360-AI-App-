# Tracker: Phase 0 (foundation)

A row is DONE only when a test for it passed when last run. Last run: `npx jest` on the four suites below, 4 suites, 31 tests, all passed.

| Item | Status | Evidence / limit |
| --- | --- | --- |
| API client: bearer, `X-Correlation-Id`, `X-Device-Id`, `X-App-Version` headers | DONE | `__tests__/client.test.ts` |
| `Idempotency-Key` only on mutations, caller key kept, same key reused on the 401 retry | DONE | `__tests__/client.test.ts` |
| `If-Match` sent as `"<version>"` | DONE | `__tests__/client.test.ts` |
| One refresh then one retry on 401; second 401 or failed refresh signs out | DONE | `__tests__/client.test.ts` |
| Network failure, 204, error body mapped to `ApiError` | DONE | `__tests__/client.test.ts` |
| Error code to translation key mapping | DONE (keys only) | `__tests__/errors.test.ts`. The translated texts themselves are not part of this row. |
| Money maths (Decimal, Indian grouping) | DONE | `__tests__/money.test.ts` |
| Config for dev, staging, production | DONE (parsing only) | `__tests__/config.test.ts`. No real staging or production values exist yet. |
| CI (lint, typecheck, test on pull request) | WRITTEN, NOT RUN | `.github/workflows/ci.yml` has not run on GitHub yet. |
| OpenAPI types generation | SCRIPT ONLY | `scripts/gen-api-types.mjs` exists. Types are NOT generated: no `openapi.json` is on disk and no staging URL is known. Untested. |
| Keycloak PKCE login, secure token storage, logout | NOT TESTED | No staging URL, no `agro360-mobile` client, no test users. Not run on a real Android phone. |
| i18n (English, Hindi, Marathi) and language picker | NOT TESTED | No test in this tracker row. |
| Sign in on a real Android phone, see name and permissions | NOT DONE | Needs staging API URL, Keycloak client and test users from the owner. |

# Tracker: Phase 1, screen "Stock check" (`app/stock.tsx`, branch `screen-stock`)

Backend used (all DONE in `docs/modules/M05-status.md`, UC-068): `GET /inventory/stock`, `GET /inventory/batches`, `GET /products/by-barcode/:code`, and for the branch and warehouse filters `GET /branches`, `GET /warehouses` (these need `org.config.view`; without it the filters are hidden).

| Item | Status | Evidence / limit |
| --- | --- | --- |
| Stock list with search by code or name, branch and warehouse filter, paging | DONE (mocked API) | `__tests__/stock.test.tsx`, `__tests__/stock-logic.test.ts`. Not run against a real backend: no staging URL. |
| Batch and expiry view (with stock, expiring in 60 days, expired) | DONE (mocked API) | `__tests__/stock.test.tsx`. The batches endpoint has no text search or branch filter, so those are hidden on that tab. |
| Expiry highlighting in colour and words | DONE | `__tests__/stock.test.tsx`, `__tests__/stock-logic.test.ts` |
| Quantities and money as decimal strings, value hidden when the API sends none | DONE | `__tests__/stock.test.tsx`, `__tests__/stock-logic.test.ts` |
| States: loading, empty, error (with correlation id), offline, permission denied | DONE (mocked API) | `__tests__/stock.test.tsx` |
| Stale data labelled when a refresh fails for lack of network; "as of" time shown | DONE (mocked API) | `__tests__/stock.test.tsx`. LIMIT: the cache is in memory only. After the app is closed there is nothing to show offline (the SQLite cache from `docs/ARCHITECTURE.md` is not built). |
| Barcode scan to filter by product | PARTLY | The flow (scan, lookup, filter, not found) is tested with the scanner replaced by a fake. The real camera (`src/features/stock/BarcodeScanner.tsx`, `expo-camera`) has NOT been run on a device. `expo-camera` must be installed. |
| English, Hindi, Marathi strings | DONE (texts) | `src/i18n/locales/*.json`, key `stock`. Hindi and Marathi written by hand, need a native speaker review. |
| Maestro end to end flow | WRITTEN, NOT RUN | `maestro/stock.yaml`. Needs a signed-in session on a device or emulator. |
| Link to the Stock screen from home | NOT DONE | Route `/stock` exists; the home screen does not link to it yet. |
| Branch filter shows only when the user may list branches | NOT TESTED against a real user | Depends on the user's permissions on staging. |
