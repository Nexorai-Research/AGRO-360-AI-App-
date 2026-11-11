## Step 4: HR self-service, owner reports, accounts and compliance (view)

All lines below: mocked API, not run against the real backend. Tests: `__tests__/hr-screens.test.tsx` (27 passing), `__tests__/reports-accounts.test.tsx` (24 passing). tsc and eslint clean. No device run was done.

DONE (screen plus passing test)
- Leave (`/leave`, `src/features/hr/LeaveScreen.tsx`): balances, my requests, apply (date checks, one Idempotency-Key reused on retry, new key when the body changes), cancel, and for hr.leave.approve a team tab with approve and reject (reject needs a reason of 3 or more letters). Endpoints: GET /hr/leaves, /hr/leave-balances, /hr/leave-types; POST /hr/leaves, /hr/leaves/:id/cancel, /approve, /reject.
- My payslips (`/payslips`): list and expandable detail, money by formatINR from strings. GET /hr/payslips.
- Field visits and beat plans (`/visits`): planned beats, last 7 days of visits, record a visit (offlineRef equals the Idempotency-Key, so a lost answer cannot store it twice), plan a beat, cancel a beat. GET /hr/beat-plans, /hr/field-visits; POST /hr/field-visits, /hr/beat-plans, /hr/beat-plans/:id/cancel.
- Advances (`/advances`): list with open and outstanding totals, request (amount validated as a decimal string, 2 places, max 1,00,00,000; installments 1 to 60; sent as strings). GET /hr/advances, /hr/me; POST /hr/advances.
- Reports (`/reports`): sales analysis, profitability, collection efficiency (with ageing), tax summary, losses; 7/30/90 days; group by; plain View bars. Only reports the user has permission for are offered (reports.sales, reports.financial, reports.receivables). GET /reports/sales/analysis, /profitability, /collections/efficiency, /tax/summary, /losses.
- Accounts (`/accounts`, view only): day book, trial balance, ledger balances. GET /reports/day-book, /reports/trial-balance, /finance/accounts?balances=true.
- Compliance (`/compliance`, view only): GST summary (GSTR-3B figures), HSN summary, input credit register, this month or last. GET /gst/gstr3b, /gst/hsn-summary, /gst/itc-register.
- Each screen has loading, empty, error, offline and permission-denied states, and English, Hindi, Marathi texts (`i18n-parts/step4.json`, to be merged into the locale files).

NOT built
- Beat plan creation for another employee, mark-missed, visit summary (planned vs actual), field visit location (no GPS captured), photo on a visit.
- Advance approve, cancel, repay (payroll and cash roles, web only). Advance request is for the logged-in employee only.
- Payslip print or HTML download or share; payslip PDF.
- Leave: leave type and balance admin, applying on behalf of another employee, attachments.
- Payroll runs, salary structures, incentives, performance, employee master (web only).
- Reports: purchase analysis, inventory reports, staff productivity, customer analytics, branch comparison, audit, saved views, custom reports, CSV/Excel/PDF export, branch filter, custom date range.
- Accounts: cash book, bank book, general ledger of one account, profit and loss, balance sheet, vouchers, journals, expenses, petty cash, bank reconciliation, budgets, any posting.
- Compliance: GSTR-1 tables, snapshots and freeze, GSTR-2B import and reconciliation, ITC block rules, RCM, TDS, e-invoice, agri registers (compliance-agri).

Limits
- Day book shows the first 200 entries. Reports show the top 30 rows.
- Dates are typed as YYYY-MM-DD (no date picker). Month pickers are fixed to this month and last month.
- Percentages from the server are used only for bar width; displayed numbers stay strings. The "per installment" hint rounds up to match the server.
- Reports, accounts and compliance have no cache-age banner; pull to retry on error only.
- `src/features/hr/kit.tsx` adds useAction, Gate, Bar, Line on top of `src/ui/kit.tsx` (which is untouched).
- Jest in a `.claude/worktrees` folder needs `--testPathIgnorePatterns=/node_modules/` because package.json ignores `/.claude/`.
- Home QuickLinks, locale files and `app/_layout.tsx` are not edited; the nav texts (`nav.leave`, `nav.payslips`, `nav.visits`, `nav.advances`, `nav.reports`, `nav.accounts`, `nav.compliance`) are in the parts file for the integrator to wire to routes /leave, /payslips, /visits, /advances, /reports, /accounts, /compliance.
