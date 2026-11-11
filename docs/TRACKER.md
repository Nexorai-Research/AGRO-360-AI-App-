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
