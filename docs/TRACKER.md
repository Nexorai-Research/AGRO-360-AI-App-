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

# Tracker: Phase 1, customer search and customer 360

A row is DONE only when a test for it passed when last run. Last run: `npx jest __tests__/customers` on 2 suites, 16 tests, all passed (mocked API client; nothing here was run against the real backend or on a phone).

| Item | Status | Evidence / limit |
| --- | --- | --- |
| API calls: `GET /customers` (q, limit up to 500), `/customers/:id/360`, `/customers/:id/ledger` | DONE (mocked client) | `__tests__/customers-api.test.ts`. Request shapes were read from the backend code (`sales.controller.ts`), not checked against a running server. |
| Customer search: debounce, list, open a customer, load more | DONE (mocked client) | `__tests__/customers-screens.test.tsx`. The API pages only by raising `limit`, so "load more" re-reads the list with a larger limit (max 500). |
| Customer 360: profile, credit limit and outstanding, season totals, recent purchases | DONE (mocked client) | `__tests__/customers-screens.test.tsx`. Money shown with Indian grouping from strings. Purchase text comes from the API as sent. |
| Ledger (opening, closing, entries, newest first) | DONE (mocked client) | Loaded only when the user taps "Show ledger". Entry descriptions are the backend's English `purpose` text, not translated. |
| States: loading, empty, error with retry, permission denied, offline | DONE (mocked client) | Offline = no network after data was loaded: old data stays with "saved data as of HH:MM". The saved data lives in memory only, so after the app is closed there is no offline data. No SQLite cache yet. |
| Permission handling | DONE (mocked client) | A role without `customer.view` sees "no permission" and the API is not called; ledger hidden without `customer.ledger.view`; a 403 from the server also shows "no permission". The server stays the authority. |
| English, Hindi, Marathi texts | WRITTEN | Hindi and Marathi were written by the app team, not reviewed by a native speaker. |
| Maestro flow `maestro/customers.yaml` | WRITTEN, NOT RUN | No emulator or staging backend. The flow assumes a signed-in session and a customer named in `CUSTOMER_NAME`. |
| Link from the home screen to `/customers` | NOT DONE | Home screen belongs to another branch. Until a link exists the screen opens only by route. |
| Real data, real phone | NOT DONE | Needs the staging API, the Keycloak client and test users. |
