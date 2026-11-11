# Start prompt: build the AGRO 360 AI mobile app

Paste this whole file as your first message to Claude Code when you open it in this folder. (Claude Code also reads `CLAUDE.md` by itself.)

---

You are building the Android-first mobile app of AGRO 360 AI in this repository. The backend and web app already exist and do not change. Work one phase at a time, tell me what you did in plain words (I prefer Hinglish), and be honest about what is done and what is not.

## Step 0: learn before you write

1. Read `CLAUDE.md`, `ISSUE.md`, `docs/TECH-STACK.md`, `docs/ARCHITECTURE.md`, `docs/BUILD-PLAN.md`.
2. Read the backend repo at `/home/password/AGRO-360-AI` (read only), focusing on:
   - `apps/api/src/app.ts` (prefix `/api/v1`, CORS headers, OpenAPI at `/api/v1/openapi.json`)
   - `apps/web/src/auth.js`, `config.js`, `api.js` (the exact Keycloak PKCE login and how API calls are made)
   - `apps/web/src/pages/` (what each screen calls)
   - `docs/PROGRESS.md` and `docs/modules/*-status.md` (which backend features are really DONE; build the app only on DONE rows)
   - `docs/api` or the OpenAPI file for request and response shapes
3. Summarise in 15 lines what you learned and list anything you could not find. Wait for my OK.

## Step 1: Phase 0, foundation

Create the Expo project with TypeScript strict in this folder (not in a sub folder), and set up:

- Expo Router, ESLint, Prettier, Jest with React Native Testing Library, `tsc --noEmit`.
- GitHub Actions: lint, typecheck, test on every pull request.
- `src/api/client.ts`: base URL from config; bearer token; `X-Correlation-Id`, `X-Device-Id`, app version headers; `Idempotency-Key` on mutations; `If-Match` on edits; one token refresh then one retry on 401; error codes mapped to translated messages.
- Types generated from the backend `openapi.json` (a script, not hand typing).
- `src/auth/`: Keycloak OIDC code with PKCE through `expo-auth-session`, public client `agro360-mobile`, redirect `agro360://auth`, tokens in `expo-secure-store`, sign in as `<username>@<franchise code>`, logout that clears everything.
- `src/i18n/`: i18next loading the web app's translation files (English, Hindi, Marathi first); a language picker.
- Config for dev, staging and production; `.env.example` with no real values.
- Tests: client headers and idempotency key reuse, error mapping, token refresh, money maths.

Done means: the app runs, I can sign in on a real Android phone against the staging backend, I see my name and permissions, and I can sign out. Show me the test output.

## Step 2: Phase 1, field and POS core (one screen per pull request)

Order: home dashboard, stock check, customer search and 360, collections and receipts, POS billing with barcode scan and invoice share, attendance. For each screen:

- Use only existing, DONE backend endpoints. If one is missing or not DONE, say so and stop that screen.
- Handle loading, empty, error, offline and permission-denied states, in English, Hindi and Marathi.
- Write the test first or alongside, and a Maestro script for the main flow.
- Open a pull request with a short description, what was tested, and the limits.

## Things to ask me, not guess

- The Keycloak client `agro360-mobile` and the staging API URL and test users (I will give them).
- Anything about store listing, app name, icon, colours, payment or messaging providers, printers.
- Any backend change you believe is needed: write it as a note for the backend team; do not make it.

## How to report

At the end of every task: what is done (with the test you ran and its result), what is not done and why, and what you need from me. Never say "done" for something you did not run.
