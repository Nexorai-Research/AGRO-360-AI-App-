## Users, roles, documents, audit and account extras

All rows: mocked API, not run against the real backend or a phone. Paths, bodies and permissions were copied from `apps/api/src/{identity,security,org}.controller.ts` and the web pages `users.js`, `roles.js`, `documents.js`, `audit.js`, `account.js`. No new routes: these extend `/users`, `/roles`, `/documents`, `/audit` and `/account`. Texts are in `i18n-parts/usr.json` (English, Hindi, Marathi) and must be merged into the locale files.

| Feature | State | Test |
|---|---|---|
| Add user (`POST /users`): name, username, mobile (+91 and spaces accepted), email, roles, all-branches or chosen branches, warning when no email | DONE | `__tests__/usr-users.test.tsx`, `__tests__/usr-logic.test.ts` |
| Edit user (`PATCH /users/:id` with `If-Match` version, only changed fields): name, mobile, email, roles, branch scope | DONE | `__tests__/usr-users.test.tsx` |
| Deactivate and activate again (already built in Step 5) | DONE | `__tests__/step5-admin.test.tsx` |
| Unlock account, reset two-factor (reason of 10+ characters; the server needs a sign-in within 15 minutes for the reset and the screen shows its refusal) | DONE | `__tests__/usr-users.test.tsx` |
| Sign-ins of another user: list and end one (`GET/DELETE /users/:id/sessions`) | DONE | `__tests__/usr-users.test.tsx` |
| Invite: the server sends the invitation in the background when a user with an email is created. There is no separate resend endpoint in the backend, so none in the app | DONE as far as the backend goes | `__tests__/usr-users.test.tsx` |
| Create role, or copy of a role (`POST /roles`) | DONE | `__tests__/usr-roles.test.tsx` |
| Rename role (`PATCH /roles/:id`, version) and delete role (`DELETE /roles/:id`, confirm step, blocked while users hold it) | DONE | `__tests__/usr-roles.test.tsx` |
| Permission matrix (`GET /permissions`, `PUT /roles/:id/permissions`): grouped by area, locked when the module is not in the plan or you do not hold the permission | DONE | `__tests__/usr-roles.test.tsx` |
| Approval limits (`PUT /roles/:id/limits`): 8 limits, decimals as strings, percentages up to 100, empty means not set | DONE | `__tests__/usr-roles.test.tsx`, `__tests__/usr-logic.test.ts` |
| System roles stay read only | DONE | `__tests__/usr-roles.test.tsx` |
| Documents: status counts (`GET /documents/dashboard`), tap to filter | DONE | `__tests__/usr-docs.test.tsx` |
| Documents: upload with the phone file picker (`POST /documents`, base64 body, 4 MB and file type checked first) | DONE (mocked) | `__tests__/usr-docs.test.tsx` |
| Documents: replace file (`POST /documents/:id/versions`), versions list, download of any version through the share sheet | DONE (mocked) | `__tests__/usr-docs.test.tsx` |
| Audit trail: detail per row (full ids, username, outcome), "only this user" and "only this action" shortcuts, Today and Last 7 days ranges (existing text filters and date range kept) | DONE | `__tests__/usr-audit-account.test.tsx` |
| Account: date format, theme, default printer (`PUT /me/preferences`, only changed fields). Display name and language were already built | DONE | `__tests__/usr-audit-account.test.tsx` |

NOT built or limits:
- Document storage: the backend keeps files inside the database (4 MB limit) while the storage decision M02-OD-14 is open. The endpoints exist and are coded, but nothing here was run against a server, a real picker or a real share sheet. If the owner picks object storage the upload body may change.
- Account: the date format and theme are saved on the server but this app does not change its own look or dates from them yet. The default branch of the preferences is not offered (needs the branch list for every role).
- The audit trail has no before and after values: the server leaves the detail field out of `GET /audit`. Nothing to show.
- Users: no resend-invitation action (no such endpoint). The user form does not set a default branch (the server picks the first branch).
- Branch names and role names appear in the user form only when the person may read them (`GET /branches`, `GET /roles` with `identity.role.manage`); otherwise that part is left out of the request and a line says so.
- Prettier is not installed in this checkout, so the new files were not run through it; eslint and tsc are clean.
