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
