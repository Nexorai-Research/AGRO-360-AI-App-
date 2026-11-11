# Mobile app: technology stack and why

The AGRO 360 AI mobile app is a client of the existing backend. The backend does not change for the app. This document says what we use and, for each choice, why.

## What the backend gives us (facts from the backend repo)

| Fact | Consequence for the app |
| --- | --- |
| REST API, NestJS, TypeScript, prefix `/api/v1`, OpenAPI at `/api/v1/openapi.json` (docs are off by default in production) | Plain HTTPS + JSON. Types can be generated from the OpenAPI file. |
| Login is Keycloak, OIDC authorization code with PKCE, public client, realm `agro360`, no secret in the client | The app is also a public client. It must use PKCE and keep no secret. |
| Every mutation needs an `Idempotency-Key` header; edits use `If-Match` (optimistic version) | The app creates one key per user action and keeps it across retries. A bad network must never create a double bill. |
| CORS allows headers `X-Device-Id`, `X-Device-Key`, `X-Correlation-Id` | The app sends a stable device id and a correlation id on every call. |
| Multi-tenant: the franchise comes only from the verified token, never from the body | The app never sends a tenant id. Franchise users sign in as `<username>@<franchise code>`. |
| The server authorises every call; the client only decides which menus to show | The app hides what the user may not do, but never relies on that for safety. |
| 21 Indian languages in `apps/web/src/i18n` plus English source (`source.json`) | The same translation files are reused in the app. |

## Chosen stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **React Native with Expo (managed workflow)** | One code base for Android and iOS. Real native app, Play Store and App Store ready. Expo gives camera, secure storage, notifications and OTA updates without native build work. |
| Language | **TypeScript (strict)** | Same language as the backend. Request and response types come from the OpenAPI file, so a backend change breaks the build, not the customer. |
| Navigation | **Expo Router** (file based) | Standard for Expo, deep links work (`agro360://invoice/123`). |
| Login | **expo-auth-session** (OIDC code + PKCE) against Keycloak | Same flow as the web app, so Keycloak needs only one new public client. |
| Token storage | **expo-secure-store** (Android Keystore, iOS Keychain) | Tokens must not sit in plain storage on a phone. |
| Server data | **TanStack Query** | Caching, retries, refetch on reconnect, and mutation queue hooks. |
| Offline data | **expo-sqlite** | Stock list, product catalogue and customers cached for the shop floor. |
| Forms and validation | **react-hook-form + zod** | Validate before sending. Backend still re-validates. |
| Barcode | **expo-camera** (barcode scanning) | POS and stock need scanning. Backend already has `GET /products/by-barcode`. |
| Printing and sharing | **expo-print**, **expo-sharing** | Invoice PDF and the WhatsApp share link the backend already makes. |
| Push | **expo-notifications** | Low stock, due payments, approvals. Needs the messaging provider (M14) to be real; until then local only. |
| i18n | **i18next** loading the web app's language files | One translation source for web and app. |
| Money | **decimal.js** (never floating point) | The backend sends money as text with fixed decimals. The app must not round with floats. |
| Tests | **Jest + React Native Testing Library**, **Maestro** for end to end | Maestro scripts run on a real emulator. |
| Quality | ESLint, Prettier, `tsc --noEmit` in CI | Same discipline as the backend. |
| Builds | **EAS Build** (cloud) or local Gradle for APK | APK for testers, AAB for Play Store. |

## Choices we rejected

- **Flutter.** Fine technology, but new language (Dart), none of the web or backend types or logic can be reused, and a second team skill to maintain.
- **PWA only.** Cheapest, but weak camera and barcode behaviour, no real offline billing, and no store presence. Kept as a fallback for the owner dashboard only.
- **Native Kotlin and Swift.** Two code bases for the same screens. Too slow for this team size.

## Security rules for the app

1. PKCE only; no client secret anywhere in the app or the repo.
2. Tokens only in secure storage; cleared on logout and on refresh failure.
3. No personal data in logs. KYC numbers and farmer ids are shown masked, as the backend already masks them.
4. Certificate pinning is optional and decided at release time.
5. A jail-broken or rooted device only gets a warning at first; policy later.
6. App version is sent on every call so the backend can force an upgrade.
