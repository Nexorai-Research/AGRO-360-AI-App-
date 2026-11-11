# Issue: Build the AGRO 360 AI mobile app (Android first)

## Summary

Build a mobile app for the AGRO 360 AI franchise ERP. The web app and the backend already exist in a separate repository. The app uses the same backend and the same Keycloak login; no backend change is needed to start.

## Decisions

- React Native with Expo and TypeScript (strict). One code base for Android and iOS; Android first.
- Login: Keycloak OIDC authorization code with PKCE, public client `agro360-mobile`, redirect `agro360://auth`, tokens in secure storage.
- API: `/api/v1`, bearer token, `Idempotency-Key` on every mutation, `If-Match` on edits, correlation and device headers, types generated from `openapi.json`.
- Offline: read cache first (products, stock, customers); POS drafts in phase 2.
- Languages: reuse the web app's translation files (English, Hindi, Marathi first).

Details are in `docs/TECH-STACK.md`, `docs/ARCHITECTURE.md` and `docs/BUILD-PLAN.md`.

## Scope

- [ ] Phase 0: project, CI, API client, Keycloak login, languages, config
- [ ] Phase 1: home dashboard, POS billing with barcode scan, stock check, customer 360, collections and receipts, attendance
- [ ] Phase 2: offline POS drafts, approvals inbox, push notifications, goods receipt
- [ ] Phase 3: owner reports, field visits, farmer screens, payslips

## Acceptance

- A user signs in on a real Android phone and sees only what their permissions allow.
- A sale made in the app appears in the web app with the same totals, tax and stock effect.
- Retrying a failed request never creates a duplicate document.
- Each screen has a passing test and handles loading, empty, error, offline and permission-denied states.

## Dependencies on the backend team

- A Keycloak public client `agro360-mobile` (PKCE required, redirect `agro360://auth`).
- Staging API URL and test franchise users.
- Minimum supported app version returned by the API (so old apps can be told to update).
- Real SMS/WhatsApp provider (M14) before push notifications are real.

## Out of scope for now

iOS release, Bluetooth printer support, offline money movements (receipts, returns, adjustments), e-invoice and e-way bill.
