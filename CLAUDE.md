# CLAUDE.md: instructions for working in this repository

This repository is the mobile app of AGRO 360 AI (a multi-tenant agro-retail ERP). Read this file first, then `docs/START-PROMPT.md`.

## Where things are

- This repo (the app): the folder you are in. Everything you write goes here.
- The backend and web app (read only for you): `/home/password/AGRO-360-AI`. Never edit it from this repo's session. Read it to learn the API, the login and the rules.
- Plan documents: `docs/TECH-STACK.md`, `docs/ARCHITECTURE.md`, `docs/BUILD-PLAN.md`, and the first issue in `ISSUE.md`.

## Hard rules

1. Work only inside this repo. Do not change the backend repo.
2. Never put a secret, token, password or key in the code or in git. Use `.env` (ignored) and `.env.example`.
3. Money and quantities are strings from the API. Use a decimal library, never floating point.
4. Every POST, PUT, PATCH and DELETE sends an `Idempotency-Key` created once per user action and reused on retry. Edits send `If-Match`.
5. The app never sends a tenant id. The franchise comes from the token. The server authorises every call; the app only hides screens.
6. Tokens only in secure storage. No personal or KYC data in logs.
7. A feature is DONE only with a passing test and a line in the tracker. If something is not built or has a limit, write that plainly. Never claim more than was run.
8. Do not add any AI or tool attribution to commits, pull requests, code or documents.
9. Work on a branch, open a pull request into `main`. Do not push to `main` after the first setup. Do not force push without being asked.
10. When a choice belongs to the owner (a vendor, a price, a policy, store listing), stop and ask. Do not guess.

## Commands (once the project exists)

Use Node 24 (`export PATH=$HOME/.local/node/bin:$PATH` on this machine). Keep these working: `npm run lint`, `npm run typecheck`, `npm test`.
