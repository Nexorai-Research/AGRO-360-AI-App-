## Finance: settings, opening balances, year-end, accounting export, inter-branch cash, recurring expenses (web parity)

All rows: mocked API, not run against the real backend or on a phone. Paths, bodies, limits and permissions were copied from `apps/api/src/{finance,finance-ops}.controller.ts` and `modules/finance/src/domain/{finance,finance-b}.ts`. New screens are in the Accounts group on Home. Texts: `i18n-parts/fx.json` (English, Hindi, Marathi). Tests: `__tests__/fx-finance.test.tsx`, 18 passed.

| Feature | State | Test |
|---|---|---|
| Accounting settings: view, change with `If-Match` version, blank = no limit (`finance.settings.manage`) | DONE (mocked) | `fx-finance.test.tsx` |
| Opening balances: add lines (account search, debit or credit), live difference to equity, save; reverse with a reason; hidden when locked (`finance.opening.manage`) | DONE (mocked) | same |
| Year-end: pick a year, see checks, close with a reason of 10+ letters (`finance.yearend.close`) | DONE (mocked) | same |
| Accounting export: Generic CSV or Tally XML for a period, saved and opened in the share sheet; account mapping; export history (`finance.export.run`) | DONE (mocked) | same |
| Cash between branches: list and post (`finance.intercompany.manage`) | DONE (mocked) | same |
| Recurring expenses: list, add, switch on or off, make due drafts; expenses by category report | DONE (mocked) | same |
| One Idempotency-Key per action, kept on retry | DONE | same |

NOT built or limits:
- The file share sheet and the real file content were not tried on a phone; the test only checks the call.
- Opening balances list shows up to 8 accounts per search; the mapping list shows the first 60 accounts.
- Recurring expense: no tax amount, branch or cost centre, and no edit besides on/off.
- Not built yet in Finance: bank statement import and bank line entry, period lock from a voucher post, GRNI report, ITC reconciliation.
- Dates are typed as YYYY-MM-DD. Hindi and Marathi texts need native review.
