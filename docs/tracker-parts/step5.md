## Step 5: account and admin screens

All lines below: mocked API, not run against the real backend. Evidence: `__tests__/step5-account.test.tsx` and `__tests__/step5-admin.test.tsx` (51 tests passing).

DONE (each covered by loading / empty / error / offline / permission-denied tests where it applies):
- My account (`/account`, needs `identity.session.view`): display name and language (`GET/PUT /me/preferences`, only changed fields sent), sign-ins list (`GET /auth/sessions`, address already masked by the server), end one sign-in (`DELETE /auth/sessions/:id`), sign out everywhere with a confirm step (`POST /auth/logout-all`, then this phone signs out), own devices (`GET /devices`) and revoke with a reason of 5+ characters (`POST /devices/:id:revoke`). Idempotency-Key is reused on a lost-answer retry and renewed when the body changes. No device key, token or password is shown.
- Users (`/users`, needs `identity.user.manage`): list with search, status filter, load more (`GET /users`), details, deactivate with a 10+ character reason (`POST /users/:id:deactivate`), activate again (`POST /users/:id:reactivate`). Role names come from `GET /roles` only when the person also holds `identity.role.manage`; otherwise a count is shown.
- Roles (`/roles`, `identity.role.manage`): view only, permissions grouped by area, approval limits (`GET /roles`).
- Audit trail (`/audit`, `identity.security.manage`): read only list with action, entity, user id, from and to filters, validated before sending, load more (`GET /audit`). India-day range, `to` is exclusive.
- Documents (`/documents`, `org.document.view`): list with search, status and category filters, load more (`GET /documents`); deactivate and restore only with `org.document.manage` (`POST /documents/:id:deactivate|restore`).
- Settings (`/settings`): view only. Company (`org.company.manage`, bank account number masked to the last 4), branches, payment modes, business rules (`org.config.view`). Each part fails on its own.

NOT built:
- Change password, two-factor sign-in setup, registering a new device (the device key is shown once, so it is left to the web app).
- Add or edit user, unlock, reset 2FA, user sessions of other people.
- Create, edit or delete roles; change permissions or limits.
- Document upload, replace, versions list and file download (file content is base64 in the API; not done on the phone).
- Editing any setting; tax, number series, print templates, field and menu configuration (`configuration.js`), import history, Security centre (`security.js`).
- Platform-owner screens (Franchises, Plans, platform audit) skipped on purpose.
- Nav entries exist only as texts (`nav.*` in `i18n-parts/step5.json`); the Home quick links and locale files are not edited here, so merge the texts and links in a later step.

Limits: shapes are hand-copied from the backend source and not checked against a running server. The `/.claude/` path is ignored by the jest config, so in a worktree run jest with `--testPathIgnorePatterns=/node_modules/`.
