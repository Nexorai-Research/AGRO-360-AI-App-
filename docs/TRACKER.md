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

# Tracker: Phase 1 (field and POS core)

| Screen | Status | Evidence / limit |
| --- | --- | --- |
| Home dashboard (`app/index.tsx`, `src/features/home/`) | DONE for the component logic, NOT RUN against the real backend | `__tests__/home.test.tsx`, 14 tests passed with a mocked API client: loading, empty, error with retry, offline with cached data and "as of" time, permission denied (by permission and by a 403), per user cache key, sign-out clears the cache, English, Hindi and Marathi, rupee formatting. Uses only `GET /reports/dashboard/owner?period=today` (backend M13 UC-223, marked DONE there, needs permission `reports.sales`). Response types are written by hand from the backend source, not generated (no OpenAPI file yet). The Maestro flow `maestro/home.yaml` is written and NOT run. Limits: the cache is in memory only, so after the app restarts with no network the screen shows the error state, not old numbers. The web home also shows payment mix, latest bills, expiring batches, "needs attention", insights, a sales goal and quick actions; those are NOT built here. The branch manager dashboard (UC-224 is only PARTIAL in the backend) is not used. Hindi and Marathi texts need a native speaker review. |
| Collections and receipts (`app/collections/index.tsx`, `app/collections/receipt-new.tsx`, `src/features/collections/`) | DONE for the component logic, NOT RUN against the real backend | `__tests__/collections.test.tsx`, 32 tests passed with a mocked API client (full suite 90 tests, 8 suites; lint and typecheck clean). Covers: outstanding list biggest first with decimal totals, follow-up tab, loading, empty, error with retry, offline with cached data and "as of" time, permission denied (by permission and by a 403), calling a customer; receipt form: amount checked as a decimal string, cheque fields, only enabled modes and never CREDIT, ONE Idempotency-Key reused on retry after a lost answer, a new key when the body changes, no double submit while sending, save blocked offline with a message, branch chosen for single-branch users, English and Hindi text. Backend: M09 UC-164 receive payment, UC-167 aging and UC-169 follow-up tasks are marked DONE there; endpoints `GET /reports/receivables/aging` (needs `reports.receivables`), `GET /credit/tasks` (needs `credit.followup`), `POST /receipts` (needs `receipt.create`), `GET /settings/payment-modes` and `GET /branches` (both need `org.config.view`), `GET /customers`. Response and body types are written by hand from the backend source, not generated (no OpenAPI file yet). The Maestro flow `maestro/collections.yaml` is written and NOT run. Limits: recording a task outcome (paid, promise, not reachable, dispute), promises to pay, cheque register, allocating a receipt by hand, receipt list and receipt share/print are NOT built. There is no connectivity listener (no NetInfo): "offline" is recognised when a call fails for lack of network, so the save button is not disabled the moment airplane mode is switched on, only after a failed call; a save that fails for lack of network keeps its key and is safe to tap again. Lists are cached in memory only. The receipt date is today in India time, taken when the form opens. Hindi and Marathi texts need a native speaker review. |

# Tracker: Phase 1, customer search and customer 360
A row is DONE only when a test for it passed when last run. Last run: `npx jest __tests__/customers` on 2 suites, 16 tests, all passed (mocked API client; nothing here was run against the real backend or on a phone).
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
