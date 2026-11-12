## Finance: vouchers, chart, expenses, bank, petty cash, periods, budgets, checks (branch `worktree-agent-a6d2d2e787b430b65`)

All lines below: mocked API, not run against the real backend, not run on a phone or emulator. Shapes were copied by hand from `modules/finance/src/application/*` and `apps/api/src/finance*.controller.ts`. Texts are in `i18n-parts/fin.json` (en, hi, mr; namespace `fin`, plus `nav.fin*` and `featureDesc.fin*`), not yet merged into the locale files; `__tests__/fin-logic.test.ts` checks the three languages have the same keys. Hindi and Marathi wording needs a native speaker review. Every write sends one Idempotency-Key per user action (reused on a retry of the same request, renewed when the body changes) and edits send the version as If-Match. No tenant id is sent.

| Feature | Route | Status and evidence |
| --- | --- | --- |
| Vouchers list with status filter; voucher detail with lines; post, submit for approval, approve, reject (reason), cancel, reverse (reason) | `/finance-vouchers` | DONE (mocked client). `__tests__/fin-vouchers.test.tsx` (19 tests). Buttons follow status, the server's `needsApproval` flag and permissions. |
| New journal, payment, receipt and contra voucher (saved as a draft, then Post from the detail) | `/finance-vouchers` | DONE (mocked client). `__tests__/fin-vouchers.test.tsx`, `__tests__/fin-logic.test.ts` (10 tests: decimal balance check, bodies, buttons). Unbalanced journal refused on the phone; lost answer retried with the same key. |
| Accounting entries (journals of the last 30 days, expand to see lines) | `/finance-vouchers` tab | DONE (mocked client), shown in the screen code; covered only by the list tests, no dedicated test. |
| Chart of accounts: list with balance, search, type filter; ledger of one account (last 90 days, running balance); add account; edit name, description, active (If-Match); add group; cost centres (view) | `/finance-chart` | DONE (mocked client). `__tests__/fin-chart.test.tsx` (12 tests). System accounts cannot be switched off from the phone. |
| Expenses: list with status filter, detail, new expense (with duplicate warning and "record anyway"), submit, approve, reject, pay (cash or bank ledger and date), reverse | `/finance-expenses` | DONE (mocked client). `__tests__/fin-expenses.test.tsx` (16 tests). |
| Bank accounts: list (masked number), add, edit holder, UPI and active (If-Match) | `/finance-bank` | DONE (mocked client). `__tests__/fin-bank.test.tsx` (20 tests, with reconciliation). The account number goes to the server once and is not kept or logged. |
| Bank reconciliation: book against bank, statement lines by status, accept a suggestion, manual match to a book entry of the same direction and amount, unmatch, run matching again, enter the statement balance and sign | `/finance-bank` tab | DONE (mocked client). `__tests__/fin-bank.test.tsx`. A refusal from the server on signing is shown in the server's words (English). |
| Petty cash: funds, new fund, spend, replenish, count the box, counts list, approve or reject a count | `/finance-petty` | DONE (mocked client). `__tests__/fin-petty.test.tsx` (16 tests). |
| Financial year periods: view, lock a month, reopen the latest locked month (reason of 10+ characters) | `/finance-control` | DONE (mocked client). `__tests__/fin-control.test.tsx` (19 tests, with budgets and checks). |
| Budgets: list, view lines, against actual (variance), submit, approve, reject, new version | `/finance-control` tab | DONE (mocked client). `__tests__/fin-control.test.tsx`. |
| Exception queue (accounting checks): list by status, run the checks, acknowledge, resolve with a written resolution | `/finance-control` tab | DONE (mocked client). `__tests__/fin-control.test.tsx`. |

NOT built, and why:
- Editing a draft voucher or expense (PUT with If-Match): the phone can cancel and re-enter a draft voucher; a draft expense cannot be edited from the phone (Reject path exists for approvers only). Not built to keep the forms small.
- Save-and-post in one step: the phone saves a draft, then the user presses Post (two real user actions, two keys).
- Opening balances (view and save), posting rules, ineligible input tax entry, gateway fee posting, finance settings, cost centre create and edit, expense templates and generate, petty cash fund edit.
- Creating or revising a budget (the web form enters monthly figures per account), year-end closing, accounting export (Tally and others), consolidation, inter-branch entries, cash flow, forecast, working capital, tax reconciliation, expenses report, profit and loss by branch, general ledger CSV and other exports, control-account reconciliation, GRNI report.
- Bank statement import (needs picking a CSV file and mapping its columns), posting a bank charge or interest from a statement line, reopening a signed reconciliation.
- Printable voucher.
- Filters by date, branch and cost centre on lists; lists show the latest 100 only (the server gives no total).
- Trial balance, day book, cash book, bank book, profit and loss and balance sheet already exist in `/accounts` and `/statements` (earlier steps) and were not changed.
- Hindi and Marathi texts need a native speaker review.
