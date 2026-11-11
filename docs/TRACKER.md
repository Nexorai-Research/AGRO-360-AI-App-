# Tracker: Phase 0 (foundation)

A row is DONE only when a test for it passed when last run. Last run: `npx jest` on the four suites below, 4 suites, 31 tests, all passed.

| Item | Status | Evidence / limit |
| --- | --- | --- |
| API client: bearer, `X-Correlation-Id`, `X-Device-Id`, `X-App-Version` headers | DONE | `__tests__/client.test.ts` |
| `Idempotency-Key` only on mutations, caller key kept, same key reused on the 401 retry | DONE | `__tests__/client.test.ts` |
| `If-Match` sent as `"<version>"` | DONE | `__tests__/client.test.ts` |
| One refresh then one retry on 401; second 401 or failed refresh signs out | DONE | `__tests__/client.test.ts` |
| Network failure, 204, error body mapped to `ApiError` | DONE | `__tests__/client.test.ts` |
| Error code to translation key mapping | DONE (keys only) | `__tests__/errors.test.ts`. The translated texts themselves are not part of this row. |
| Money maths (Decimal, Indian grouping) | DONE | `__tests__/money.test.ts` |
| Config for dev, staging, production | DONE (parsing only) | `__tests__/config.test.ts`. No real staging or production values exist yet. |
| CI (lint, typecheck, test on pull request) | WRITTEN, NOT RUN | `.github/workflows/ci.yml` has not run on GitHub yet. |
| OpenAPI types generation | SCRIPT ONLY | `scripts/gen-api-types.mjs` exists. Types are NOT generated: no `openapi.json` is on disk and no staging URL is known. Untested. |
| Keycloak PKCE login, secure token storage, logout | NOT TESTED | No staging URL, no `agro360-mobile` client, no test users. Not run on a real Android phone. |
| i18n (English, Hindi, Marathi) and language picker | NOT TESTED | No test in this tracker row. |
| Sign in on a real Android phone, see name and permissions | NOT DONE | Needs staging API URL, Keycloak client and test users from the owner. |

# Tracker: Phase 1 (field and POS core)

| Screen | Status | Evidence / limit |
| --- | --- | --- |
| Home dashboard (`app/index.tsx`, `src/features/home/`) | DONE for the component logic, NOT RUN against the real backend | `__tests__/home.test.tsx`, 14 tests passed with a mocked API client: loading, empty, error with retry, offline with cached data and "as of" time, permission denied (by permission and by a 403), per user cache key, sign-out clears the cache, English, Hindi and Marathi, rupee formatting. Uses only `GET /reports/dashboard/owner?period=today` (backend M13 UC-223, marked DONE there, needs permission `reports.sales`). Response types are written by hand from the backend source, not generated (no OpenAPI file yet). The Maestro flow `maestro/home.yaml` is written and NOT run. Limits: the cache is in memory only, so after the app restarts with no network the screen shows the error state, not old numbers. The web home also shows payment mix, latest bills, expiring batches, "needs attention", insights, a sales goal and quick actions; those are NOT built here. The branch manager dashboard (UC-224 is only PARTIAL in the backend) is not used. Hindi and Marathi texts need a native speaker review. |
| Collections and receipts (`app/collections/index.tsx`, `app/collections/receipt-new.tsx`, `src/features/collections/`) | DONE for the component logic, NOT RUN against the real backend | `__tests__/collections.test.tsx`, 32 tests passed with a mocked API client (full suite 90 tests, 8 suites; lint and typecheck clean). Covers: outstanding list biggest first with decimal totals, follow-up tab, loading, empty, error with retry, offline with cached data and "as of" time, permission denied (by permission and by a 403), calling a customer; receipt form: amount checked as a decimal string, cheque fields, only enabled modes and never CREDIT, ONE Idempotency-Key reused on retry after a lost answer, a new key when the body changes, no double submit while sending, save blocked offline with a message, branch chosen for single-branch users, English and Hindi text. Backend: M09 UC-164 receive payment, UC-167 aging and UC-169 follow-up tasks are marked DONE there; endpoints `GET /reports/receivables/aging` (needs `reports.receivables`), `GET /credit/tasks` (needs `credit.followup`), `POST /receipts` (needs `receipt.create`), `GET /settings/payment-modes` and `GET /branches` (both need `org.config.view`), `GET /customers`. Response and body types are written by hand from the backend source, not generated (no OpenAPI file yet). The Maestro flow `maestro/collections.yaml` is written and NOT run. Limits: recording a task outcome (paid, promise, not reachable, dispute), promises to pay, cheque register, allocating a receipt by hand, receipt list and receipt share/print are NOT built. There is no connectivity listener (no NetInfo): "offline" is recognised when a call fails for lack of network, so the save button is not disabled the moment airplane mode is switched on, only after a failed call; a save that fails for lack of network keeps its key and is safe to tap again. Lists are cached in memory only. The receipt date is today in India time, taken when the form opens. Hindi and Marathi texts need a native speaker review. |

# Tracker: Phase 1, customer search and customer 360
A row is DONE only when a test for it passed when last run. Last run: `npx jest __tests__/customers` on 2 suites, 16 tests, all passed (mocked API client; nothing here was run against the real backend or on a phone).
| API calls: `GET /customers` (q, limit up to 500), `/customers/:id/360`, `/customers/:id/ledger` | DONE (mocked client) | `__tests__/customers-api.test.ts`. Request shapes were read from the backend code (`sales.controller.ts`), not checked against a running server. |
| Customer search: debounce, list, open a customer, load more | DONE (mocked client) | `__tests__/customers-screens.test.tsx`. The API pages only by raising `limit`, so "load more" re-reads the list with a larger limit (max 500). |
| Customer 360: profile, credit limit and outstanding, season totals, recent purchases | DONE (mocked client) | `__tests__/customers-screens.test.tsx`. Money shown with Indian grouping from strings. Purchase text comes from the API as sent. |
| Ledger (opening, closing, entries, newest first) | DONE (mocked client) | Loaded only when the user taps "Show ledger". Entry descriptions are the backend's English `purpose` text, not translated. |
| States: loading, empty, error with retry, permission denied, offline | DONE (mocked client) | Offline = no network after data was loaded: old data stays with "saved data as of HH:MM". The saved data lives in memory only, so after the app is closed there is no offline data. No SQLite cache yet. |
| Permission handling | DONE (mocked client) | A role without `customer.view` sees "no permission" and the API is not called; ledger hidden without `customer.ledger.view`; a 403 from the server also shows "no permission". The server stays the authority. |
| English, Hindi, Marathi texts | WRITTEN | Hindi and Marathi were written by the app team, not reviewed by a native speaker. |
| Maestro flow `maestro/customers.yaml` | WRITTEN, NOT RUN | No emulator or staging backend. The flow assumes a signed-in session and a customer named in `CUSTOMER_NAME`. |
| Link from the home screen to `/customers` | NOT DONE | Home screen belongs to another branch. Until a link exists the screen opens only by route. |
| Real data, real phone | NOT DONE | Needs the staging API, the Keycloak client and test users. |

# Tracker: Phase 1, screen "Stock check" (`app/stock.tsx`, branch `screen-stock`)
Backend used (all DONE in `docs/modules/M05-status.md`, UC-068): `GET /inventory/stock`, `GET /inventory/batches`, `GET /products/by-barcode/:code`, and for the branch and warehouse filters `GET /branches`, `GET /warehouses` (these need `org.config.view`; without it the filters are hidden).
| Stock list with search by code or name, branch and warehouse filter, paging | DONE (mocked API) | `__tests__/stock.test.tsx`, `__tests__/stock-logic.test.ts`. Not run against a real backend: no staging URL. |
| Batch and expiry view (with stock, expiring in 60 days, expired) | DONE (mocked API) | `__tests__/stock.test.tsx`. The batches endpoint has no text search or branch filter, so those are hidden on that tab. |
| Expiry highlighting in colour and words | DONE | `__tests__/stock.test.tsx`, `__tests__/stock-logic.test.ts` |
| Quantities and money as decimal strings, value hidden when the API sends none | DONE | `__tests__/stock.test.tsx`, `__tests__/stock-logic.test.ts` |
| States: loading, empty, error (with correlation id), offline, permission denied | DONE (mocked API) | `__tests__/stock.test.tsx` |
| Stale data labelled when a refresh fails for lack of network; "as of" time shown | DONE (mocked API) | `__tests__/stock.test.tsx`. LIMIT: the cache is in memory only. After the app is closed there is nothing to show offline (the SQLite cache from `docs/ARCHITECTURE.md` is not built). |
| Barcode scan to filter by product | PARTLY | The flow (scan, lookup, filter, not found) is tested with the scanner replaced by a fake. The real camera (`src/features/stock/BarcodeScanner.tsx`, `expo-camera`) has NOT been run on a device. `expo-camera` must be installed. |
| English, Hindi, Marathi strings | DONE (texts) | `src/i18n/locales/*.json`, key `stock`. Hindi and Marathi written by hand, need a native speaker review. |
| Maestro end to end flow | WRITTEN, NOT RUN | `maestro/stock.yaml`. Needs a signed-in session on a device or emulator. |
| Link to the Stock screen from home | NOT DONE | Route `/stock` exists; the home screen does not link to it yet. |
| Branch filter shows only when the user may list branches | NOT TESTED against a real user | Depends on the user's permissions on staging. |

| Attendance check in and out (`app/attendance.tsx`, `src/features/attendance/`) | DONE for the component logic, NOT RUN against the real backend or on a phone | `__tests__/attendance.test.tsx`, 22 tests passed with a mocked API client: loading, empty history, check in and check out, recent days list, server refusal translated (ALREADY_CHECKED_IN), the same Idempotency-Key AND the same body (location included) reused on a retry after a network failure, a fresh key for the next action, no location asked before consent, consent saved with its own key, "Not now", phone refuses the location permission (punch still goes, without coordinates), stop sharing, no location card when the franchise does not allow it, offline (today not loaded, saved data shown, punch fails), 403 and missing permission (`hr.attendance.self`), English, Hindi, Marathi. Uses `GET hr/attendance/today`, `GET hr/attendance/mine`, `POST hr/attendance/check-in`, `POST hr/attendance/check-out`, `POST hr/me/geo-consent` (backend M12 UC-214, marked DONE there, with the note that its integration tests are pending). Response and request shapes are written by hand from the backend source, not generated (no OpenAPI file yet). The Maestro flow `maestro/attendance.yaml` is written and NOT run. Added `expo-location` (needs a new native build; the permission text is in `app.json`). Limits: check in and out are online only, nothing is queued offline; the route `/attendance` exists but no button on the home screen opens it yet; the geo-fence flag text and the "flag" field from the server are English only and not shown; the branch geo-fence only flags, the app never blocks; the web screen also lets HR mark and correct days and export a register, those are NOT built here. Hindi and Marathi texts need a native speaker review. |

# Tracker: Phase 1, POS billing (`app/pos.tsx`, `src/features/pos/`)
| POS billing counter | DONE for the component logic, NOT RUN against the real backend or on a phone | `__tests__/pos.test.tsx`, 13 tests passed with a mocked API client: product search, add and merge lines, qty/price/discount checked as decimal strings, the server prices the bill (`POST /sales/invoices/preview`, only the newest answer is shown), customer or walk-in, split tenders by enabled mode (never CREDIT), walk-in must pay in full, change on cash, ONE Idempotency-Key per bill reused after a lost answer (new key if the bill changes), no double submit, offline message, no permission (`sales.pos.use`) makes no API call, English and Hindi. Uses `GET /branches`, `/warehouses`, `/settings/payment-modes`, `/products`, `/products/by-barcode/:code`, `/customers`, `POST /sales/invoices/preview`, `POST /sales/invoices`. Types are written by hand from the backend source. Limits NOT built: hold and resume bill, invoice list, returns and cancel, invoice print/share/PDF, shifts and day-end, quick-add customer, batch pick and FEFO override, crop-protection capture, wholesale. The real barcode camera is not run on a device. Offline is recognised only after a failed call (no NetInfo). No Maestro flow yet. Hindi and Marathi texts need a native speaker review. |

# Tracker: Phase 1, POS step 1 rest (branch `pos-invoices-shifts`)
Last run: `npx jest __tests__/pos` 2 suites, 29 tests passed (mocked API client; nothing here was run against the real backend or on a phone).
| Item | Status | Evidence / limit |
| --- | --- | --- |
| Hold and resume a bill (`GET/POST /sales/held`, `GET/DELETE /sales/held/:id`) | DONE (mocked client) | `__tests__/pos-more.test.tsx`: resume restores lines, customer and bill discount, then drops the held bill; hold sends label and cart with a key. Held bills are on the server, not on the phone. |
| Quick-add customer (`POST /customers/quick`) | DONE (mocked client) | Mobile checked 10 digits starting 6-9; hidden without `customer.create`. |
| Invoice list (`app/invoices.tsx`) | DONE (mocked client) | Last 100 only; no paging, search or filter. |
| Return (credit note) and cancel | DONE (mocked client) | Quantity checked as a decimal against what is left; one Idempotency-Key kept across a lost-answer retry. One line per credit note (the web does the same). Buttons hidden without `sales.return` / `sales.invoice.cancel`. |
| Invoice share link / send to customer | DONE (mocked client) | Opens the phone share sheet with the server link (`POST /sales/invoices/:id/share`). Send to customer only queues it; the WhatsApp provider is a mock on the backend. |
| Print, PDF | NOT BUILT | The print and PDF endpoints need the bearer token and return HTML/PDF bytes; the API client reads JSON only. Needs a file download and a viewer (decision: `expo-print` or `expo-sharing`). Bluetooth thermal printing is out of scope. |
| Shifts: open, close, day-end (`app/shifts.tsx`) | DONE (mocked client) | Cash as decimal strings; difference shown before closing; day-end only with `pos.dayend`. Cash movements in a shift and a day-end history are NOT built. |
| Sales register report, accounting entries of an invoice | NOT BUILT | Web Sales "Reports" tab and the "Entries" button. |
| Links | DONE | Home quick links to Invoices and Shifts. |
| Maestro flows, real phone, staging | NOT DONE | Needs staging URL, Keycloak client and test users. |

# Tracker: Step 2, Products and Inventory (branch `products-inventory`)
Last run: `npx jest __tests__/products-inventory` 1 suite, 17 tests passed (mocked API client; nothing here was run against the real backend or on a phone).
| Item | Status | Evidence / limit |
| --- | --- | --- |
| Product list with search and status filter (`app/products/index.tsx`) | DONE (mocked client) | First 100 only, no paging. Needs `product.view`. |
| Product detail: prices, status, activate / deactivate / archive | DONE (mocked client) | Stock-on-hand warning from the server needs a second deliberate tap (`confirmStock`). |
| Product create and edit (`app/products/form.tsx`) | DONE (mocked client) | Decimal checks; MRP rule; edit sends `If-Match` version and clears blank optional fields; duplicate warning asks then resends with `confirmDuplicate`. NOT built: pack size and pack unit, HSN-not-in-library confirm, grade, crop, variety, composition and units tabs, regulated flags. |
| Barcodes: list, generate internal EAN-13, add, remove | DONE (mocked client) | Hidden without `product.barcode`. The barcode picture is not drawn, only the number. |
| Price history and set price | DONE (mocked client) | Cost shown only with `inventory.value.view`; loss warning when cost is above selling price. |
| Stock adjustments: create draft, submit, cancel, approve, reject (`app/adjustments.tsx`) | DONE (mocked client) | One line per adjustment (the web does the same). A decrease above stock on hand is refused on screen. Approve and reject follow the server's maker-checker rule; the app only hides buttons. |
| Transfers inside a branch and move to damaged stock (`app/transfers.tsx`) | DONE (mocked client) | Between branches is not available in the backend either. NOT built: write-off. |
| Batches with stock: block and release (`app/batches.tsx`) | DONE (mocked client) | NOT built: expiry extension request and approval, expired and expiring tabs (the Stock check screen shows expiry). |
| NOT built | | Categories, brands, units, price lists, tax mapping, import / export, labels, opening stock, stock ledger, reorder rules and alerts, valuation. |
| Real data, real phone, Maestro flows | NOT DONE | Needs staging URL, Keycloak client and test users. Hindi and Marathi texts need a native speaker review. |

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
