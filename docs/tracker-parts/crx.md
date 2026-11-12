## Credit interest, payment reminders and credit settings (web parity)

All rows: mocked API, not run against the real backend or on a phone. Paths, bodies, limits and permissions were copied from `apps/api/src/collections.controller.ts`, `modules/credit/src/domain/collections.ts` and the web page `collections.js`. New routes `/credit-interest`, `/credit-reminders`, `/credit-settings` (home module Operations, next to Cheques). Texts are in `i18n-parts/crx.json` (English, Hindi, Marathi). Tests: `__tests__/crx-credit-admin.test.tsx`, 19 passed.

| Feature | State | Test |
|---|---|---|
| Interest runs: list, draft a run up to a date (`POST /credit/interest-runs`), open a run with its lines and the days per bill | DONE (mocked) | `crx-credit-admin.test.tsx` |
| Post a draft run as debit notes, cancel a run (reason), waive one customer's interest (reason); posted runs have no actions | DONE (mocked) | same |
| Payment reminders: rules list, add and edit (the whole list is sent, as the server replaces it; 12 rules at most), send due reminders now, delivery log with the reason a message was held back | DONE (mocked) | same |
| Credit settings: view (`customer.ledger.view`), change with `If-Match` version (`credit.settings.manage`): interest on/off, rate, grace days, receipts pay interest first, automatic hold (days, amount), hold on bounce, bounce charge, settlement limit; rates and money stay decimal strings, blank means none | DONE (mocked) | same |
| Run the daily pass now (`POST /credit/collections/run`) | DONE (mocked) | same |
| One Idempotency-Key per action, reused when the same save is sent again after a lost answer; a new key when the body changes | DONE | same |

NOT built or limits:
- Reminder rules cannot be deleted or re-ordered one by one; the web page does not do it either (it sends the list). Turn a rule off instead.
- The reminder message text is not previewed with real values.
- Lists show what the server sends (interest runs: all; delivery log: latest 100). No filters.
- Dates are typed as YYYY-MM-DD (no date picker).
- Hindi and Marathi texts need a native speaker review.
