## Web parity, phase 9: finance, HR and settings

All rows: mocked API, not run against the real backend or a phone. Copied from the web pages `finance.js` (voucherEditor, setupTab, the GRNI check), `finance-ops.js` (expense form, budgetsTab), `hr.js` (leave types), `settings.js` (licences) and `customers.js` (statement). Texts are in `i18n-parts/wp9.json`.

| Feature | State | Test |
|---|---|---|
| 9a.1 Cost centres: add (code 2-20 capital letters, digits or dashes) and switch on / off with the version (`POST /finance/cost-centres`, `PATCH /finance/cost-centres/:id`, `finance.account.manage`); chart of accounts, cost centres tab | DONE | `__tests__/wp9.test.tsx` |
| 9a.2 Edit a draft voucher (`PUT /finance/vouchers/:id`, If-Match) and a draft expense (`PUT /finance/expenses/:id`, If-Match), in the same form as a new one; "Edit draft" on the detail of a DRAFT | DONE | `__tests__/wp9.test.tsx` (voucher on screen; expense through the shared form logic) |
| 9a.2 New budget: name, financial year, up to three income / expense accounts with a monthly amount spread over April to March (`POST /finance/budgets`, `finance.budget.manage`); periods and budgets, budgets tab. Month-by-month changes stay on the web, like the web dialog says | DONE | `__tests__/wp9.test.tsx` |
| 9a.3 New leave type (`POST /hr/leave-types`, `hr.leave.approve`); leave screen | DONE | `__tests__/wp9.test.tsx` |
| 9a.4 Agro licences of the branches: list, add, change with the version and record status (`GET/POST /licences`, `PATCH /licences/:id`, change with `org.licence.manage`); settings screen | DONE | `__tests__/wp9.test.tsx` |
| 9a.5 Customer statement as a PDF (`GET /customers/:id/statement.html` in the chosen language, made into a PDF and shared; `customer.ledger.view`); customer 360, share panel | DONE | `__tests__/wp9.test.tsx` |
| 9a.6 Unbilled receipts (GRNI): value received, billed, unbilled per receipt and whether the books agree (`GET /procurement/reports/grni`, `reports.purchase`); purchase reports | DONE | `__tests__/wp9.test.tsx` |
