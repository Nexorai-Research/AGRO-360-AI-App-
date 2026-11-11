# Mobile app: how it will be built

Rule from the backend project, kept here: a feature is DONE only when it has a passing test, and the tracker (`docs/PROGRESS.md`) says what is built and what is not, including limits.

## Phase 0: foundation

- Expo + TypeScript project, ESLint, Prettier, Jest, CI (lint, typecheck, tests, APK build).
- API client with idempotency, correlation id, token refresh, error code mapping.
- Keycloak PKCE login, secure storage, logout.
- Language loader and the language picker (English, Hindi, Marathi first; the other 18 files load the same way).
- Config for dev, staging and production.
- Acceptance: a user can sign in on a real Android phone, see their name and permissions, and sign out.

## Phase 1: field and POS core

| Screen | Backend it uses (existing) |
| --- | --- |
| Home dashboard (today sales, low stock, dues) | reports and alerts endpoints |
| POS billing with barcode scan, payment, invoice share and PDF | products, sales (`/sales/invoices`, `/sales/quick-stock`, share link, PDF) |
| Stock check by branch, warehouse, batch and expiry | `/inventory/stock`, `/inventory/batches`, scan |
| Customer 360 and search | customer 360, customers |
| Collections and receipts, outstanding list | collections, ledger |
| Attendance check in and out | HR attendance |

Acceptance for each screen: works against the staging backend, error codes translated, Maestro end to end script passes.

## Phase 2: offline and approvals

- Offline POS drafts with a send queue and conflict display.
- Approvals inbox (adjustments, transfers, requisitions, count variances) with maker-checker respected.
- Push notifications once a real messaging provider exists.
- Purchase: goods receipt with barcode.

## Phase 3: more modules

Reports for the owner, field visits for agronomists, crop advice, the farmer self-service screens, payroll payslip view for staff. Each only after the backend row is DONE.

## Testing

1. Unit: money maths, idempotency key reuse, error mapping, offline queue.
2. Component: forms and validation.
3. End to end (Maestro): login, make a sale, return, stock check.
4. Contract: types are generated from `openapi.json`; CI fails if the backend contract changes and the app does not compile.
5. Manual device checklist for each release (low network, airplane mode, rotation, small screens, large fonts, Hindi text).

## Definition of done for a screen

- Runs on Android (iOS later), translated, accessible labels, large touch targets.
- Handles loading, empty, error, offline and permission-denied states.
- No secrets, no personal data in logs.
- A test, and a line in this repo's tracker.

## Risks

| Risk | Plan |
| --- | --- |
| Backend and app repos drift | Generated types and a contract check in CI |
| Weak shop network | Cache first, idempotency, clear stale labels |
| Device variety on low end Android | Test on an old phone; keep lists virtualised |
| Printing to Bluetooth thermal printers | Needs a native module; decided after phase 1 |
| No real SMS/WhatsApp provider yet | Notifications limited to in-app until M14 is real |
