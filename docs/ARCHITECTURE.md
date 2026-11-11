# Mobile app: architecture

## Big picture

```
 Phone (React Native / Expo)
   |  HTTPS + JSON, Bearer token, Idempotency-Key
   v
 AGRO 360 AI API (existing NestJS backend)  --> PostgreSQL (row level security per franchise)
   ^
   |  OIDC code + PKCE
 Keycloak (realm agro360)
```

The app owns no business rules. Prices, tax, stock, credit limits and permissions are decided by the backend. The app collects input, shows results, and keeps a small offline cache.

## Folder layout (app repo)

```
app/                 Expo Router screens (login, home, pos, stock, customers, collections, ...)
src/api/             client.ts (fetch wrapper), generated types from openapi.json, one file per module
src/auth/            Keycloak PKCE login, token refresh, secure storage
src/offline/         SQLite cache, mutation queue with idempotency keys
src/i18n/            language loader (shared files from the web app)
src/ui/              components: Button, Money, Field, BarcodeScanner, EmptyState
src/features/        pos/, stock/, customers/, collections/, attendance/, approvals/, reports/
docs/                these documents
```

## The API client rules

1. Base URL from config (`API_BASE_URL`), never hard coded; dev, staging and production differ.
2. Every request sends `Authorization: Bearer`, `X-Correlation-Id`, `X-Device-Id`, and the app version.
3. Every POST, PUT, PATCH, DELETE sends an `Idempotency-Key` created once per user action and reused on retry.
4. Edits send `If-Match` with the version read earlier; a conflict shows "changed by someone else, reload".
5. Errors use the backend's stable codes (for example `PRICE_LOCKED`, `STOCK_FROZEN`, `CREDIT_LIMIT_EXCEEDED`). The app maps each code to a translated message; unknown codes show a generic one with the correlation id.
6. A 401 triggers one token refresh and one retry; a second 401 logs out.
7. Money and quantities stay as strings from the API and are formatted with a decimal library.

## Offline policy (important for shops with weak network)

| Data | Offline behaviour |
| --- | --- |
| Product list, prices, batches and stock, customers | Cached; shown with "as of" time. Stock figures are labelled as possibly stale. |
| POS sale | Phase 2. Draft saved on the phone and sent when online, one idempotency key per sale. The server still decides price and stock, and can refuse; the app shows the refusal and keeps the draft. |
| Everything that moves money or stock (receipts, returns, adjustments, approvals) | Online only in phase 1. |

Never show an offline number as if it were live.

## Login flow

1. User enters franchise code and username (`<username>@<franchise code>`).
2. App opens Keycloak in the system browser (not an in-app web view), authorization code with PKCE.
3. App stores tokens in secure storage, loads `/me` style data (the same call the web app makes) for permissions and branch scope.
4. Menus come from permissions; the server still checks each call.
5. Refresh token rotates in the background; logout clears storage and ends the Keycloak session.

Keycloak needs a new public client `agro360-mobile` with redirect URI `agro360://auth` and PKCE required.

## Release and versioning

- Semantic version in the app; the build number rises on every build.
- The API returns the minimum supported app version; below it the app shows "please update".
- Staging backend for testers, production for store builds.
