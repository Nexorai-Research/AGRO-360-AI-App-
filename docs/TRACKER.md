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
| Print, PDF (`src/features/pos/print.ts`, buttons on `app/invoices.tsx`) | DONE (mocked client and mocked `expo-print` / `expo-sharing`) | `__tests__/pos-print.test.tsx` (7 tests) and 2 new tests in `__tests__/client.test.ts`. The API client got a text mode (`as: 'text'`) so it can read `GET /sales/invoices/:id/print?paper=A4` with the bearer token. Print opens the phone print dialog; PDF makes a file with `expo-print` and opens the share sheet with `expo-sharing`; message when the phone cannot share; server refusal shown; buttons hidden without `sales.invoice.print`. Limits: the PDF is made on the phone from the server's HTML page, not the server's `/pdf` endpoint; A4 only (the 80mm paper option is not used); the real print dialog, the share sheet and a real printer were NOT run on a phone; Bluetooth thermal printing is still out of scope; the server marks a reprint as Duplicate, so each tap is a counted print. Credit note PDF (`GET /sales/returns/:id/pdf`) is NOT built. |
| Shifts: open, close, day-end (`app/shifts.tsx`) | DONE (mocked client) | Cash as decimal strings; difference shown before closing; day-end only with `pos.dayend`. Cash in / out inside an open shift (`POST /pos/shifts/:id/cash-movements`: kind, amount 1 paisa to 1,00,00,000 as a 2-place string, reason 2 to 200 letters, one Idempotency-Key kept on retry) and the day-end history list (`GET /pos/day-end`, last 100 closed days, only with `pos.dayend`) are DONE (mocked client): `__tests__/pos-shifts-extra.test.tsx`, 9 tests. Limits: the history shows sales, bills and cash difference only (the full summary, bank deposits and per-tender totals are not shown); no day-end preview before closing; denominations count on close is not built; only the cashier of a shift can record a movement (the server refuses others and the message is shown). |
| Sales register report (Reports screen, kind "Sales register", `GET /reports/sales-register`, needs `reports.sales`) | DONE (mocked client) | `__tests__/reports-register.test.tsx`, 6 tests: totals and rows in rupees from strings, tax invoice / bill of supply / credit note labels, first 100 rows shown with a count of the rest, empty, offline, hidden without `reports.sales`, Hindi. Limits: period is last 7 / 30 / 90 days only; no branch, customer, cashier or status filter; the server's CSV export is not used; the first 100 rows of up to 5,000 are shown; cancelled bills are listed but the server leaves them out of totals (the screen says so). NOT built: the accounting entries of an invoice (web "Entries" button). |
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

## Step 3: purchases, complaints, collection follow-up

All lines below: mocked API, not run against the real backend, not run on a phone or emulator. Evidence is Jest only (`__tests__/purchase.test.tsx` 24 tests, `__tests__/complaints-followup.test.tsx` 22 tests). Shapes were copied by hand from the backend source (no OpenAPI file exists yet).

### Done (with passing test)

| Feature | Screen | Endpoints used | Test evidence |
|---|---|---|---|
| Purchase order list with status filter, approvals tab, supplier list, goods-receipt list | `/purchase` | GET `/procurement/purchase-orders`, `/procurement/purchase-orders/approvals`, `/procurement/suppliers`, `/procurement/goods-receipts` | list, loading, empty, offline, error, 403 denied, no permission, view-only hides buttons |
| Purchase order detail, submit, approve, reject, cancel | `/purchase/[id]` | GET `/procurement/purchase-orders/:id`; POST `.../submit`, `.../approve`, `.../reject`, `.../cancel` (If-Match = version read) | approve sends version and one key, lost answer reuses the key, changed reason gets a new key, reason of 5 letters, own order has no approve button, hidden without permission |
| New purchase order (supplier, branch, warehouse, lines by search or barcode scan) | `/purchase/order-new` | POST `/procurement/purchase-orders`; GET `/branches`, `/warehouses`, `/products`, `/products/by-barcode/:code` | empty form refused, decimal checks (qty 6 places, rate 4, discount 0..100), scan adds line, same body same key after lost answer |
| Goods receipt against an order, barcode scan counts one unit, reject reason, batch and expiry | `/purchase/receive/[id]` | POST `/procurement/goods-receipts`, POST `.../:id/receive` | scan counts as decimal, product not on order reported, nothing entered refused, receipt saved then post retried with the same key without creating a second receipt, over-receipt answer shown |
| Complaints list, new complaint, status change with resolution text, comment | `/complaints`, `/complaints/new`, `/complaints/[id]` | GET `/complaints`, `/complaints/:id`; POST `/complaints`, `/complaints/:id/transition` (If-Match), `/complaints/:id/comments`; GET `/customers` | list states, resolve needs text, version sent, retry same key, changed body new key, controls hidden without `customer.complaint` / `customer.complaint.resolve` |
| Collection follow-up: record task outcome, promise to pay (create, cancel, list), receipt list | `/collections/follow-up` | POST `/credit/tasks/:id/outcome`, `/customers/:id/promises`, `/credit/promises/:id/cancel`; GET `/credit/promises`, `/receipts` | promise needs amount (2 places) and a date after today, dispute needs a note, same key on retry, tabs follow permissions |

Texts: `i18n-parts/step3.json` (en, hi, mr; namespaces purchase, complaints, followup, nav). Not yet merged into `src/i18n/locales/*.json`; a test checks the three languages have the same keys. Hindi and Marathi wording has not been reviewed by a native speaker.

### Not built
- Supplier create or edit, supplier bank accounts, ledger, block or activate.
- Purchase order edit of a draft (PATCH), revise, send to supplier, close.
- Goods receipt: discard of a saved draft, approve over-receipt, reverse, receipt without an order, free quantity, per-line damaged quantity.
- Purchase bills, three-way match, supplier returns and claims, payments, payables ageing, purchase register, requisitions, RFQs, schemes, landed cost.
- Complaints: photos, assign or claim, rating, reopen window message, trends, SLA policy.
- Customers screens beyond the existing list and detail, villages and territories, customer tools, engagement (admin screens, skipped).
- Collections: reassigning tasks, reminders, cheques, write-offs, settlements.
- Offline queue: all of these are online only; nothing is saved on the phone.
- Links from the home quick links and menu: the shared `QuickLinks.tsx` and `_layout.tsx` were not edited, so the new routes are reachable only by path until the owner adds them.

### Limits
- Order totals and GST on the new-order form are an estimate for the screen only (quantity x rate less discount); the server computes the real totals.
- If a receipt is saved but posting fails, the saved receipt id is kept only while the screen is open. Leaving the screen leaves a draft receipt that has to be posted or discarded from the web app.
- Jest needs `--testPathIgnorePatterns /node_modules/` when run from inside a `.claude` worktree, because the project config ignores paths containing `/.claude/`.

## Customers: more sections on Customer 360 (branch `customers-gaps`)

Mocked API, not run against the real backend or a phone. Evidence: `__tests__/customers-more.test.tsx` (12 tests).

DONE (read only; each section closed until opened, then one query; states: loading, empty, error with retry, denied):
- Farms and crops: farms with plots, area and soil as strings (`GET /customers/:id/farms`).
- KYC documents: type, masked number, expired mark (`GET /customers/:id/documents`, needs `customer.kyc.view`; the server writes an access log on each list, so it loads only when opened). The document file is never opened on the phone.
- Loyalty: tier, points, spend and the spend still needed for the next tier as a decimal (`GET /customers/:id/loyalty`).
- Household: members, who decides, who pays (`GET /customers/:id/household`).
- Consent: current consent per purpose and channel (`GET /customers/:id/consents`).
- Activity and advice: visits and calls with crop issue, advice, follow up date (`GET /customers/:id/interactions`).
- Texts in English, Hindi, Marathi (`customers.more.*`); Hindi and Marathi not reviewed by a native speaker.

NOT built here: adding or editing a farm, plot, crop plan or KYC document (no upload from the phone), changing consent, loyalty point adjustments, household edits, recording a new interaction, photos on interactions, service cases, purchase plans, crop plans, guarantors, hold history, customer statement, credit limit change and credit hold or release, creating or editing a customer (only quick-add exists), merge, anonymise. Interactions show the first answer the server sends (no paging).

## Inventory: stock reports (branch `inventory-gaps`)

Mocked API, not run against the real backend or a phone. Evidence: `__tests__/stock-reports.test.tsx` (12 tests). Screen `/stock-reports` (`app/stock-reports.tsx`, `src/features/inventory/`), linked from the Home quick links.

DONE (read only; loading, empty, offline, error with retry, denied; English, Hindi, Marathi):
- Expiry: batches with stock that are already expired, or expire within 30 / 60 / 90 days (`GET /inventory/batches` with `withStockOnly`, `expired` or `expiringWithinDays`), with days left and value at risk. Cost fields the server hides (null) are not shown.
- Stock ledger: the latest 50 movements with movement name, quantity, balance after, batch, reason (`GET /inventory/ledger`).
- Reorder rules: reorder level, minimum, maximum and order quantity per product and branch (`GET /inventory/reorder-rules`); the product default is labelled "All branches".
- Valuation: total stock value and quantity, per product and branch, with the server's warning (`GET /inventory/valuation`, needs `inventory.value.view`; the server values at weighted average even when the franchise method is FIFO and says so).

NOT built: filters (product, warehouse, branch, date range, movement type) and paging beyond the first 50 rows; reorder suggestions; creating or editing reorder rules; opening stock; stock counts and cycle plans; investigations; reservations; serial numbers; batch genealogy and trace; damage report; reconciliation and integrity reports; FIFO valuation; expiry extension request and approval; labels; import and export. Hindi and Marathi texts need a native speaker review.

## Purchase: bills and payables view (branch `purchase-gaps`)

Mocked API, not run against the real backend or a phone. Evidence: `__tests__/purchase-money.test.tsx` (11 tests). Screen `/purchase-money` (`app/purchase-money.tsx`, `src/features/purchase/`), linked from the Home quick links. `src/ui/ReadBox.tsx` is a small shared read-only query box; the stock reports screen now uses it too (its 12 tests still pass).

DONE (read only; loading, empty, offline, error, denied; English, Hindi, Marathi):
- Purchase bills: unpaid (default) or all, with supplier, number, date, due date, match status, total, paid, outstanding (`GET /procurement/purchase-bills`, `open=true`, last 50).
- Supplier payments: mode, reference, amount, TDS withheld, cash paid, advance not yet allocated (`GET /procurement/supplier-payments`, last 50).
- Returns to suppliers: number, bill, reason, total (`GET /procurement/purchase-returns`, last 50).
- Payables ageing: total payable and the five buckets (not due, 1-30, 31-60, 61-90, 90+), per supplier, with advance not yet allocated (`GET /procurement/reports/payables-aging`, needs `purchase.supplier.ledger.view`).

NOT built: creating or posting a bill, three-way match actions and override, paying a supplier, supplier returns and claims, supplier create and edit, supplier ledger, bank accounts and contacts, requisitions, RFQs and comparison, schemes and free quantity, landed cost, purchase register, GRNI report, pending orders report, purchase order edit / revise / send / close, goods receipt discard / approve over-receipt / reverse. Bills, payments and returns show the first 50 only (the server gives no total, so the screen only says there may be more); no search or date filter. Hindi and Marathi texts need a native speaker review.

## Accounts: financial statements view (branch `accounts-gaps`)

Mocked API, not run against the real backend or a phone. Evidence: `__tests__/statements.test.tsx` (9 tests). Screen `/statements` (`app/statements.tsx`, `src/features/accounts/`), linked from the Home quick links. All need `reports.financial`.

DONE (read only; loading, empty, offline, error, denied; English, Hindi, Marathi):
- Profit and loss for the last 7 / 30 / 90 days: net sales, cost of sales, gross profit, operating expenses, other income, net profit, and each section's accounts (`GET /reports/profit-loss`).
- Balance sheet as of today: assets, liabilities, equity, totals, profit this year; a warning when the server says it does not balance (`GET /reports/balance-sheet`).
- Cash book and bank book for the period: opening, receipts, payments, closing per ledger, with a note when the balance went below zero (`GET /reports/cash-book`, `/reports/bank-book`).

NOT built: comparison with the previous period; custom dates, branch and cost-centre filters; branch-wise profit; the day-by-day lines of the cash and bank book; general ledger of one account; vouchers, journals, expenses, petty cash, bank reconciliation, budgets, opening balances, periods, year-end; exports (CSV, Excel, PDF); any posting. Hindi and Marathi texts need a native speaker review.

## Parity with the web app (branch `parity-forms`, one item per commit)

### Customer create and edit
Mocked API, not run against the real backend or a phone. Evidence: `__tests__/customer-form.test.tsx` (14 tests). Screen `/customers/form` (`app/customers/form.tsx`, `src/features/customers/CustomerFormScreen.tsx`, `form-logic.ts`, `form-api.ts`); a "New customer" button on the customer list (needs `customer.create`) and an "Edit customer" button on Customer 360 (needs `customer.update`).

DONE: create (`POST /customers`) and edit (`PATCH /customers/:id`, version sent as If-Match, only changed fields sent, a cleared optional field sent as null). Checks copy the server: name 2 to 120, mobile 10 digits starting 6 to 9, alternate mobile, state code 2 digits, PIN 6 digits, GSTIN pattern and its first two digits equal to the state code, 80 letters for village, taluka and district. One Idempotency-Key per action, kept on a retry after a lost answer, renewed when the body changes. A same name in the same village (DUPLICATE_WARNING) asks and then sends `confirmDuplicate`; a same mobile (DUPLICATE_MOBILE) is shown in words. Category chosen from active categories. English, Hindi, Marathi.

Limits: the village is typed text; picking from the village and territory master (`villageId`) is not built. The GSTIN checksum is checked only by the server. Recording consent while creating, credit term, and the activate / deactivate action are not built here. Hindi and Marathi texts need a native speaker review.

### Credit limit and hold (branch `parity-all`)
Mocked API, not run against the real backend or a phone. Evidence: `__tests__/credit-panel.test.tsx` (11 tests). `src/features/customers/CreditPanel.tsx` and `credit-api.ts`, shown on Customer 360 for `customer.ledger.view`.

DONE: credit review (`GET /customers/:id/credit`: account, last 5 limit changes, last 5 hold changes); change limit (`PUT /customers/:id/credit-limit`, needs `credit.limit.manage`, decimal strings up to 4 places, optional season limit and reason, account version as If-Match); put on hold and release (`POST .../credit-hold` and `.../credit-release`, need `credit.hold`, reason of 3 to 500 letters). One Idempotency-Key per action, kept on a retry. A limit above the approver's own limit (APPROVAL_REQUIRED) and a stale version (STALE_VERSION) are shown in words. English, Hindi, Marathi.

Limits: credit term choice, guarantors and promises to pay (also in the same server answer) are not shown or edited. The override right for releasing an automatic hold is decided by the server only. Hindi and Marathi texts need a native speaker review.

### Farm and plot add and archive (branch `parity-all`)
Mocked API, not run against the real backend or a phone. Evidence: `__tests__/farm-editor.test.tsx` (9 tests). `src/features/customers/FarmEditor.tsx` and `farm-api.ts` on Customer 360, shown only with `customer.farm`.

DONE: add farm (`POST /customers/:id/farms`: name, ownership, optional area with unit), add plot (`POST /customers/:id/plots`: farm, name, area and unit, optional soil and irrigation), archive farm (`PATCH .../farms/:farmId` with status ARCHIVED, farm version as If-Match). Area is a decimal string, more than 0, up to 4 places. One Idempotency-Key per action, kept on a retry. English, Hindi, Marathi.

Limits: editing an existing farm or plot (rename, change area), survey number, location (geo) and geo consent, and plot archiving are not built. Crop plans are not built yet. Hindi and Marathi texts need a native speaker review.

### Record consent and log a call or visit (branch `parity-all`)
Mocked API, not run against the real backend or a phone. Evidence: `__tests__/crm-actions.test.tsx` (7 tests). `src/features/customers/CrmActions.tsx` and `crm-api.ts` on Customer 360; the consent button needs `customer.consent`, the visit button `customer.interaction`.

DONE: record one consent answer (`PUT /customers/:id/consents`, purpose from `GET /crm/consent/purposes` with inactive ones hidden, channel, agreed or refused, source STAFF); log a call, field visit or shop visit (`POST /customers/:id/interactions`: type, notes, optional crop problem, advice and follow-up date). One Idempotency-Key per action, kept on a retry. English, Hindi, Marathi.

Limits: the follow-up date is typed as YYYY-MM-DD (no date picker yet). Visit location, location consent and photos are not built. Evidence text for a consent and recording several answers at once are not built. Hindi and Marathi texts need a native speaker review.

### Loyalty points adjust (branch `parity-all`)
Mocked API, not run against the real backend or a phone. Evidence: `__tests__/loyalty-adjust.test.tsx` (4 tests). `src/features/customers/LoyaltyAdjust.tsx` and `loyalty-api.ts` on Customer 360, shown only with `crm.loyalty.manage`.

DONE: add or take away points (`POST /customers/:id/loyalty/points`): a whole number, not zero, from -100000 to 100000, with a reason of 3 to 200 letters. One Idempotency-Key per action, kept on a retry. A result below zero (INSUFFICIENT_POINTS) is shown in words. English, Hindi, Marathi.

Limits: the points ledger list (`GET .../loyalty/ledger`), tier management and recompute are not built. Hindi and Marathi texts need a native speaker review.

### Supplier create and edit (branch `parity-all`)
Mocked API, not run against the real backend or a phone. Evidence: `__tests__/supplier-form.test.tsx` (10 tests). Screen `/purchase/supplier-form` (`src/features/purchase/SupplierFormScreen.tsx`, `supplier-logic.ts`); a "New supplier" button and an edit button per supplier on the Purchase suppliers tab, shown only with `purchase.supplier.manage`.

DONE: create (`POST /procurement/suppliers`) and edit (`PATCH /procurement/suppliers/:id`, version as If-Match, only changed fields, a cleared optional field as null, a changed GSTIN sent together with the state as the server asks). Checks copy the server shapes: name 2 to 120, state code 2 digits, GSTIN pattern and first two digits equal to the state, PAN pattern, credit days and lead time whole 0 to 365, credit limit decimal up to 4 places. One Idempotency-Key per action, kept on a retry. Same GSTIN or name (DUPLICATE_WARNING) asks, then sends `confirmDuplicate`. English, Hindi, Marathi.

Limits: opening balance (needs a branch), brands, contacts, bank accounts (add, verify, retire) and active / inactive status are not built. The GSTIN check digit and whether the state code is a real GST state are checked only by the server. Hindi and Marathi texts need a native speaker review.


# Tracker: Home menu as module cards and sign-in for the test server

| Item | Status | Evidence / limit |
| --- | --- | --- |
| Home shows one card per module (Operations, Customers, Accounts, Reports, Staff, Administration, Setup, My account), like the web top menu; a module opens its screens as cards; a module with one screen opens it directly (`src/features/home/modules.ts`, `ModuleGrid.tsx`, `ModuleScreen.tsx`, `app/module/[id].tsx`) | DONE (component logic) | `__tests__/home-modules.test.tsx`, 10 tests: all 30 screens listed once, each route file exists, every feature card opens its own route, English, Hindi and Marathi texts exist, Hindi renders, Back works, unknown module. Not looked at on a phone by the developer. Limits: cards are NOT hidden by permission (the server still refuses; a denied screen shows its own message); icons are emoji; the web screens "Security centre", "Villages and territories", "Customer tools", "Engagement", "Import history", "Configuration" and "Inventory/Sales" hubs have no app screen yet. Hindi and Marathi texts need a native speaker review. |
| Sign-in with username and password for TEST servers only (`EXPO_PUBLIC_PASSWORD_LOGIN=true`, never in production) | DONE (mocked client) | `__tests__/password-login.test.ts`, `__tests__/config.test.ts`. Used because the Keycloak client `agro360-mobile` does not exist on the cloud server. Password is never stored or logged. Retries once without a stray space; server error, no network and wrong password have separate messages. To be removed when `agro360-mobile` exists. |
| The app no longer sends `X-Device-Id` | DONE | `__tests__/client.test.ts`. The backend treats that header as a registered device and answers 403 DEVICE_INVALID for any other id. Device registration is NOT built in the app. |
| On/off switch for today's numbers on Home (tiles, sales trend); module cards and profile always show | DONE (component logic) | `__tests__/home-switch.test.tsx`, 3 tests: on by default, off hides numbers and is saved, saved off starts hidden and on shows again. The choice is kept in secure storage (a non-secret flag). Not looked at on a phone by the developer. |

## Admin gaps: security, devices, imports, configuration, settings edit

All lines below: mocked API, not run against the real backend, not run on a phone or emulator. Evidence is Jest only: `__tests__/adm-security.test.tsx`, `__tests__/adm-devices-import.test.tsx`, `__tests__/adm-config-settings.test.tsx`, `__tests__/adm-logic.test.ts` (69 tests). Shapes were copied by hand from the backend source. Hindi and Marathi texts need a native speaker review. Every screen handles loading, empty, error (with the reference), offline (recognised only after a failed call, no NetInfo) and permission denied. Every write sends one `Idempotency-Key` that is reused on retry and renewed when the body changes; edits send `If-Match`. No tenant id is sent.

### Done (with passing test)

| Feature | Screen | Endpoints used | Test evidence |
|---|---|---|---|
| Security centre: password and 2FA policy (view and save, lower limits checked, roles that need 2FA) | `/security` (`identity.security.manage`) | GET and PUT `/settings/security` (If-Match = version, 0 on first save) | `adm-security.test.tsx`: shows values, save sends version, numbers and sorted roles, lost answer reuses the key, changed body gets a new key, value under the system minimum blocks save |
| Security centre: incidents (filter by status, open, view, move to next status, add note) and recent sign-in events | `/security` | GET `/security/incidents`, `/security/incidents/:id`, `/security/events`; POST `/security/incidents`, `:transition` (If-Match), `/notes` | open needs a 5+ character title and sends severity, transition sends the version, note added, closed incident has no steps or note box, status filter sent to the server, a failing part shows its reference while the rest loads, empty, offline, denied |
| Devices: list own devices, register this phone, revoke with a reason | `/devices` (`identity.session.view`) | GET `/devices`; POST `/devices`; POST `/devices/:id:revoke` | `adm-devices-import.test.tsx`: list, loading, empty, offline, error with reference, denied, register sends name and platform with a key, the returned device key goes to secure storage (`agro360.registeredDevice`) and is never shown, lost answer reuses the key, revoke needs 5+ characters |
| Import history: product imports with outcome, load more, error report handed to the share sheet | `/import-history` (`product.import`) | GET `/products/import-jobs` (cursor), GET `/products/import/:id/report` (text) | list with outcome, checked-only job, load more passes the cursor, report is fetched and shared, failed download shows the error and shares nothing, loading, empty, offline, 403, denied |
| Forms and menu configuration: per screen show or hide, required, order, name per language (English, Hindi, Marathi; labels of other languages the server holds are kept); menu rename and reorder | `/configuration` (read: `identity.session.view`, save: `org.settings.manage`) | GET `/config/fields`, `/config/fields/:screen`, `/config/menu`; PUT `/config/fields/:screen`, `/config/menu` | `adm-config-settings.test.tsx`: locked field has no toggles, save payload, hiding drops required, bad order blocks save, lost answer reuses key, view only without the manage permission, menu save, loading, error, offline, denied |
| Edit company profile (only changed fields sent, emptied optional fields sent as null, light GSTIN, PAN, IFSC and email checks) | `/settings-edit` (`org.company.manage`) | GET and PUT `/settings/company` (If-Match = version) | patch and version, bad values block save, stale-version error shows the reference and the retry reuses the key |
| Edit payment modes: turn on or off a mode that already has a ledger account; UPI address | `/settings-edit` (`org.payment_mode.manage`) | GET and PUT `/settings/payment-modes` (If-Match = mode version) | turn off sends code, flag and version; mode without a ledger shows a message instead of a button; UPI address checked and saved |
| Edit business rules (yes or no, whole numbers, choices, text) and schedule a costing method change | `/settings-edit` (`org.settings.manage`) | GET and PUT `/settings/general` | only changed values sent, whole numbers sent as numbers, non-number blocks save, costing needs a valid date, view only with `org.config.view` alone, a failing part shows its reference |
| Unlock a user, reset a user's 2FA, see and end another user's sign-ins (reason of 10 to 500 characters is recorded by the server) | `/user-security` (`identity.user.manage`) | GET `/users`; GET and DELETE `/users/:id/sessions`; POST `/users/:id:unlock`, `/users/:id:reset-2fa` | `adm-security.test.tsx`: reason length, unlock body and key, reset-2fa refused for a stale sign-in shows the message and the retry reuses the key, end one sign-in, user not yet signed in shows the error with its reference, empty, denied |

### NOT built (and why)

- Device key use: the app registers a device and keeps its key in secure storage, but the global API client still sends only the random per-install `X-Device-Id` and no `X-Device-Key`. The backend answers 403 for an unregistered `X-Device-Id`. To make the app device-bound, the client would need to send the registered id (`agro360.registeredDevice`) as `X-Device-Id` and the key as `X-Device-Key` on every call, only after a successful registration, and the sign-in flow must handle `DEVICE_REVOKED` and `DEVICE_INVALID`. This is a decision for the owner and the client owner, so it is not done here.
- Device permission limits (`PUT /devices/:id/permissions`, needs `identity.user.manage`) and other users' devices (`GET /devices?userId=`).
- 2FA reset needs a fresh sign-in (`FRESH_AUTH_REQUIRED`, HTTP 403). The app has no step-up sign-in screen, so the person sees the message and must sign out and in again before retrying.
- Security centre: assigning an incident to a person (`:assign`), adding a security event by hand (`POST /security/events`).
- Configuration: the server keeps the field and menu setup, but no screen of this app reads it, so the app's own forms and menu do not change. Only the English, Hindi and Marathi labels are editable (labels in other languages already stored are kept).
- Settings: branches, warehouses and bins, licences, financial years and months, tax rates and HSN mapping, tax settings, number series, print templates and previews, logo upload; choosing the ledger account of a payment mode (a mode without a ledger cannot be turned on from the phone).
- Import history: starting an import (file upload), validating and committing it. Only the history and the error report (shared as text, nothing saved on the phone).
- Users, roles, documents, audit, account (compared with the web pages): add user, edit user (name, mobile, roles, branches), role create, clone, permission matrix, limits and delete, document upload, replace, download and version list, and the document dashboard are NOT built. The existing screens (`/users`, `/roles`, `/documents`, `/audit`, `/account`) cover the read side and the actions listed in the Step 5 section; "My account" already lists and revokes own devices, and `/devices` adds registering.

## Compliance parity (GST returns, tax records, agri registers, licences, recalls and safety)

All lines: mocked API, not run against the real backend. Response field names were copied from the web pages, not from a live server. Evidence: `__tests__/cmp-screens.test.tsx` (23 tests passing). The app shows what the server computes; it computes no tax.

DONE:
- GSTR-1 (`/gstr1`, `compliance.gst.view`): summary, register checks, warnings, sections B2B, B2C large, B2C small, credit notes, exempt, HSN, documents, amendments (`GET /gst/gstr1`); freeze a GSTR-1 or GSTR-3B snapshot after a confirm, with warnings acknowledged (`POST /gst/gstr1/snapshot`, `/gst/gstr3b/snapshot`, needs `compliance.gst.snapshot`, one Idempotency-Key reused on retry). Test: cmp-screens.
- Tax records (`/tax-records`): reverse-charge entries with reverse after confirm (`POST /rcm/entries/:id/reverse`), blocked credit list with remove (`POST /gst/itc-blocks/:id/remove`), TDS/TCS report for the month (`GET /reports/tds`), TDS/TCS sections (`GET /tax/tds-config`), frozen returns list (`GET /gst/snapshots`). Test: cmp-screens.
- Agri registers (`/agri-registers`): pesticide, fertiliser and seed registers by month, seed lots (`GET /compliance/*-register`, `/compliance/seed-lots`). Test: cmp-screens.
- Licences (`/licences`): product registrations with suspend (reason, If-Match) and restore (If-Match), dealer authorisations with revoke, document vault list, open expiry alerts with acknowledge, renewal tasks with mark done, restricted ingredients with withdraw (reason). Test: cmp-screens.
- Recalls and safety (`/recalls-safety`): recalls, quarantine, cases, incidents, samples, authenticity checks, sale-check decisions (`GET /compliance/evaluations`), rules (view). Test: cmp-screens.
- Each screen has loading, empty, error with correlation id, offline and permission-denied states in English, Hindi and Marathi; tabs and buttons are hidden without the permission (the server still decides).

NOT built (view only or absent):
- GSTR-1 JSON/CSV download and GSTR-3B CSV export: needs saving a file on the phone; not built.
- GSTR-2B import and reconciliation, ITC decision per bill, add ITC block, RCM rules and posting RCM from a bill: forms and file import not built.
- TDS/TCS run, add section, switch on or off, compliance settings (PUT with If-Match): not built; tax policy for the owner and tax adviser.
- Creating records (registration, authorisation, document, restricted ingredient, seed lot, renewal task, recall, case, incident, sample, quarantine, authenticity check) and later steps (renew, recall scope, notify, send notices, return, close, triage, decide, custody, result, release, dispose): not built; list and view only for now.
- Rule authoring and approval, report templates and generated runs, evidence packs and audit pack download, batch trace, document access log, override report: not built.
- E-invoice and e-way bill: the backend has no endpoint in these controllers (GSP provider parts are blocked), so nothing is built. Fertiliser subsidy and POS machine reports: no endpoint found in these controllers.
- Row actions send an empty body or `{reason}`; the withdraw, revoke and suspend body fields were taken from the web page, not checked against the server validators.

## Customers: villages, customer tools, engagement, complaint trends (branch `agent-a437b7b2a7c39b418`)

All lines below: mocked API client, NOT run against the real backend, NOT run on a phone or emulator. Evidence is Jest only: `__tests__/cus-logic.test.ts`, `__tests__/cus-villages.test.tsx`, `__tests__/cus-tools.test.tsx`, `__tests__/cus-engagement.test.tsx`. Shapes and checks were copied by hand from the backend source (`agri.controller.ts`, `crm.controller.ts`, `crm-admin.controller.ts`, `domain/agri.ts`, `domain/privacy.ts`, `domain/crm.ts`); there is no OpenAPI file yet. Every screen has loading, empty, error (with the reference code), offline and permission-denied states in English, Hindi and Marathi (`i18n-parts/cus.json`, namespace `cus`; Hindi and Marathi not reviewed by a native speaker). Every write sends an Idempotency-Key made once per action and kept for a retry after a lost answer; edits send the version as If-Match.

| Feature | Route | Calls | Status and test |
| --- | --- | --- | --- |
| Villages: list with search, add, edit (only changed fields, cleared PIN sent as null), deactivate and activate (asks first), paste-CSV import with rejected rows shown | `/crm/villages` | GET/POST `/villages`, PATCH `/villages/:id`, POST `/villages/import` | DONE (mocked), `cus-villages.test.tsx`, `cus-logic.test.ts`. Add and edit need `territory.manage`. |
| Territories: list with officers, create, edit (name, status, villages), assign field officers | `/crm/villages` (tab) | GET/POST `/territories`, GET/PATCH `/territories/:id`, PUT `/territories/:id/assignees`, GET `/users`, `/roles` | DONE (mocked), `cus-villages.test.tsx`. Officers are offered only if the Field Officer role is found, as on the web; listing users and roles needs the identity permissions, otherwise the screen says nobody can be assigned. |
| Crop master: list, add with seasons, mark reviewed | `/crm/villages` (tab) | GET/POST `/crops`, POST `/crops/:id:review` | DONE (mocked), `cus-villages.test.tsx`. Add needs `customer.crop`, review needs `agri.reference.manage`. Crop stages and varieties are NOT entered. |
| Duplicates and merge (choose the record to keep, reason), merge history and undo (asks first) | `/crm/tools` | GET `/customers/duplicates`, `/customers/merges`, POST `/customers/merge`, `/customers/merges/:id:undo` | DONE (mocked), `cus-tools.test.tsx`. A group of three or more merges one other record per action. |
| Segments: list, create with one rule, count customers (small counts shown as "too few") | `/crm/tools` (tab) | GET/POST `/customer-segments`, GET `/customer-segments/:id/preview` | DONE (mocked), `cus-tools.test.tsx`, `cus-logic.test.ts`. Only fields typed by hand are offered (crop, season, land, village, language, days since last purchase, purchase value, outstanding, credit hold); rules by territory, category or product need an id picker and are NOT built; one rule per segment. The web form offers field names the server does not accept; the app uses the server's list. Amounts in rules go as JSON numbers because the server requires numbers there. Segment members list and campaign sending are NOT built. |
| Retention cohorts (6 months, small cohorts hidden) | `/crm/tools` (tab) | GET `/customer-segments/cohorts` | DONE (mocked), `cus-tools.test.tsx`. |
| Customer groups: list, create with a leader, add and remove members | `/crm/tools` (tab) | GET/POST `/customer-groups`, GET `/customer-groups/:id`, POST `/customer-groups/:id/members` | DONE (mocked), `cus-tools.test.tsx`. Group shares, allocations, exposure, dissolve and edit are NOT built. |
| Customer import: branch, opening-dues date, pasted CSV, preview with errors, confirm, earlier imports | `/crm/tools` (tab) | GET `/branches`, `/customers/import/template`, `/customers/import-jobs`, POST `/customers/import`, `/customers/import/:id/commit` | DONE (mocked), `cus-tools.test.tsx`. The CSV is pasted as text; there is no file picker (no document-picker package in the app). The commit mode is row-wise as on the web; the full error report download is NOT built. |
| Loyalty tiers: list, add tier (amounts as decimal strings), recalculate all tiers | `/crm/engagement` | GET/POST `/crm/loyalty/tiers`, POST `/crm/loyalty/recompute` | DONE (mocked), `cus-engagement.test.tsx`. Needs `crm.loyalty.manage` to write. Editing a tier is NOT built. |
| Consent: purposes, new purpose, new wording (English, Hindi, Marathi), coverage | `/crm/engagement` (tab) | GET/POST `/crm/consent/purposes`, POST `/crm/consent/purposes/:code/wording`, GET `/crm/consent/coverage` | DONE (mocked), `cus-engagement.test.tsx`. Needs `privacy.consent.manage` to write. Switching a purpose on or off is NOT built. |
| Farming calendar: events from today, add event | `/crm/engagement` (tab) | GET/POST `/crm/events` | DONE (mocked), `cus-engagement.test.tsx`. Editing or cancelling an event is NOT built. |
| Greetings: rules, add rule, run now, recent messages | `/crm/engagement` (tab) | GET/POST `/crm/greetings`, GET `/crm/messages`, POST `/crm/comms/process` | DONE (mocked), `cus-engagement.test.tsx`. Messages stay queued until a provider is connected on the backend; the screen says so. Editing a rule is NOT built. |
| Complaint trends and late-complaint check | `/complaints/insights` | GET `/crm/complaints/trends`, POST `/crm/complaints/sla-sweep` | DONE (mocked), `cus-engagement.test.tsx`. Needs `customer.complaint.resolve`. |

NOT built from the web customer and CRM pages (customer 360 actions): adding or editing a farm, plot, crop plan, purchase plan, KYC document or guarantor, changing consent or contacts for one customer, loyalty point adjustment, household create, recording an interaction, service cases, credit limit change, credit hold and release, sending a statement, customer status change, anonymise (needs fresh sign-in and the owner's policy), complaint assign, claim, photos and rating. Targets: not started in this branch; a later branch can reuse `crm-kit.tsx` (`FormCard`, `DoButton`, `Panel`).

# Tracker part: sales and collections gaps (branch of the `sal` agent)

Last run: `npx jest __tests__/sal` 2 suites, 46 tests passed (mocked API client). Together with the older `pos`, `collections` and `complaints-followup` suites: 8 suites, 146 tests passed. `tsc --noEmit` and eslint clean. Nothing here was run against the real backend or on a phone. Shapes are written by hand from the backend source. Texts: `i18n-parts/sal.json` (en, hi, mr; namespaces `cheques`, `receipts`, `credit`, `desk`, `nav`, `featureDesc`, plus new keys inside the existing `pos` namespace: merge deeply). Hindi and Marathi wording needs a native speaker review.

| Feature | Status | Test file and notes |
|---|---|---|
| Cheque register (`/cheques`, `GET /cheques?status`, `POST /cheques/:id/deposit`, `/clear`, `/bounce`; view needs `customer.ledger.view`, actions need `receipt.cheque`) | DONE (mocked client) | `__tests__/sal-collections.test.tsx`: status filter, empty, offline, 403, error with reference, no permission makes no call, deposit with a date and ONE key reused after a lost answer, clear only for a deposited cheque, bounce needs a reason (3 to 500) and sends the bank charge as a 2 place string, buttons hidden without `receipt.cheque`, Hindi and Marathi. Limits: first 100 cheques; no search by customer; the cheque history events (`GET /cheques/:id`) are not shown. |
| Receipt list, detail, apply to oldest dues, take back allocation, share (`/receipts`, `GET /receipts`, `GET /receipts/:id`, `POST /receipts/:id/allocate`, `/unallocate`) | DONE (mocked client) | Same test file: advance on account shown, allocations listed, allocate sends an empty body with one key, take back asks first, share opens the phone share sheet, hidden without `receipt.allocate`, error with reference, empty. Limits: allocation to chosen bills by hand is NOT built, because the backend has no endpoint that lists a customer's open items to pick from (the server accepts `allocations` but the app cannot get the receivable ids); only "oldest dues first" is offered. Receipt share sends plain text built on the phone (number, date, mode, amount); there is no server receipt print or PDF endpoint, so receipt print/PDF is NOT built. Last 50 receipts only. |
| Customer credit: limit, outstanding, available, hold and release, set limit (`/customer-credit`, `GET /customers/:id/credit`, `PUT /customers/:id/credit-limit` with If-Match, `POST /customers/:id/credit-hold`, `/credit-release`) | DONE (mocked client) | Same test file: figures from strings, limit checked as a decimal (0 or more, 4 places), version sent as If-Match, one key, hold needs a reason of 3 letters, controls hidden without `credit.limit.manage` / `credit.hold`, denied without `customer.ledger.view`. Limits: limit history, hold history, guarantors list (only a count), season limit and credit terms are NOT shown or edited; guarantor add and remove NOT built. |
| Collection desk: team tasks, make today's list, assign, efficiency (`/collections/desk`, `GET /credit/tasks`, `POST /credit/tasks/generate`, `POST /credit/tasks/:id/assign`, `GET /credit/tasks/efficiency`; needs `credit.followup.assign`) | DONE (mocked client) | Same test file. Assign list of officers comes from `GET /users`, which needs a user-management right; when that is refused the screen says so and "Branch manager list" still works. Officers are shown by name; the assigned person on a task is shown as the last 6 characters of the id (the task row carries no name). |
| Write-offs: list with totals, propose, approve, reject, record recovery (`GET/POST /credit/write-offs`, `/approve`, `/reject`, `/recover`) | DONE (mocked client) | Same test file: propose checked (customer, amount decimal, reason, evidence 10+ letters) before sending, note on approve, recovery with enabled payment modes, hidden without `credit.writeoff.approve` / `credit.writeoff`, needs `reports.receivables` to view. Limits: which bills a write-off covers cannot be chosen (the server then picks); the CSV export is NOT built. |
| Settlement discounts: list, propose, approve, reject (`GET/POST /credit/settlements`, `/approve`, `/reject`) | DONE (mocked client) | Same test file. Limit: cannot choose which bills (same reason). |
| POS crop-protection capture (crop, target pest, dose per line; `src/features/pos/LineExtras.tsx`, `cart.ts`) | DONE (mocked client) | `__tests__/sal-pos.test.tsx`: the three fields go on the line sent to preview and invoice; a half-filled capture blocks pricing with a message. Which products require it is decided by the server. |
| POS batch pick and FEFO override (`GET /inventory/batches?product&warehouse&withStockOnly`; needs `inventory.view`) | DONE (mocked client) | Same test file: batches listed oldest expiry first and marked, the first needs no reason, a later one asks for a reason (3+ letters) and sends `batchId` and `fefoOverrideReason`, "let the system pick" clears it, button hidden without `inventory.view`. The server decides if the override right exists. |
| POS wholesale (dealer) sale | DONE (mocked client) | Same test file: toggle shows only with a customer chosen and `sales.wholesale`; sends `wholesale: true`; the server checks the GSTIN rule (`B2B_GSTIN_REQUIRED`) and the answer is shown. |
| Held bills keep crop, batch and wholesale when resumed | DONE (mocked client) | Code path in `PosScreen.tsx`; covered by the existing resume test only for lines, customer and discount, NOT specifically for the new fields. |
| Hold and resume, returns and cancel, invoice print/PDF/share, quick-add customer, shifts | Already DONE before this step | See the POS rows of `docs/TRACKER.md`. |
| Record a task outcome, promises to pay, receipt list | Already DONE in step 3 | `__tests__/complaints-followup.test.tsx`. |
| Quotations, sales orders, price override approvals, credit-note PDF | NOT built | The web `sales.js` page has no quotation, sales order or approval tab. Price override is a right on the invoice itself (the server decides). Credit note PDF (`GET /sales/returns/:id/pdf`) is not built. |
| Collections web tabs: interest runs, reminder rules and log, credit settings, ageing with filters, guarantors | NOT built | Interest runs, reminder rules and credit settings are owner policy screens (rates, rules); ageing exists in the older Collections screen without the as-on date or filters. |
| Offline | Online only | All new screens work online; "offline" is recognised after a failed call. No queue. |

## Stock, catalogue and purchase gaps (branch `stk`)

All lines below: mocked API client, not run against the real backend, not run on a phone or emulator. Evidence is Jest only: `__tests__/stk-inventory.test.tsx` (21 tests), `__tests__/stk-catalogue.test.tsx` (16 tests), `__tests__/stk-purchase.test.tsx` (19 tests); 56 passing. Shapes were copied by hand from the web pages and `apps/api/src/{inventory,catalogue,procurement}.controller.ts`. Every write sends one Idempotency-Key per action (reused when the same request is retried), edits send If-Match from the version read, no tenant id is sent, money and quantities stay text. Each screen has loading, empty, error (with reference), offline and permission-denied states. Texts: `i18n-parts/stk.json` (en, hi, mr), not yet merged into `src/i18n/locales/*.json`; a test checks the three languages have the same keys. Hindi and Marathi were written by hand and need a native speaker review. The jest config ignores paths containing `/.claude/`, so in a worktree run with `--testPathIgnorePatterns=/node_modules/`.

### Inventory (new screens)

| Feature | Route | Status | Test / note |
| --- | --- | --- | --- |
| Stock counts: list, start (warehouse, freeze), record counts per line with live difference, send, approve, reject with note, cancel | `/inventory-counts` | DONE (mocked client) | `stk-inventory`. Not in the web page; the backend has it. The server decides who may approve. |
| Stock ledger with movement type and product filter, running balance, value hidden when the server sends none | `/inventory-ledger` | DONE (mocked client) | `stk-inventory`. First 100 rows, no paging. No date range filter. |
| Opening stock: list, one-line entry, CSV paste with full dry-run check before posting | `/inventory-opening` | DONE (mocked client) | `stk-inventory`. Needs `inventory.opening`. No file picker (CSV is pasted). |
| Expiry: batches within 60 days, expired, pending extension requests, request extension, approve or reject, run expiry and alert jobs | `/inventory-expiry` | DONE (mocked client) | `stk-inventory`. Block and release stay on the existing Batches screen. |
| Reorder levels and low-stock alerts: set, edit, remove, suggestion from sales | `/inventory-reorder` | DONE (mocked client) | `stk-inventory`. Minimum <= level <= maximum checked on screen. Bulk-by-category not built. |
| Stock value (valuation by product and branch or by warehouse, as-on date) | `/inventory-valuation` | DONE (mocked client) | `stk-inventory`. Needs `inventory.value.view`. FIFO valuation and damage-value report not built. |
| Write off damaged or expired stock | `/inventory-write-off` | DONE (mocked client) | `stk-inventory`. Needs a tick to confirm. The server applies the approval limit. |
| NOT built: warehouse and bin master, branch-to-branch transfers (dispatch, receive, shortage), in-transit report, cycle-count plans, investigations, capacity, safety-stock and lot-size suggestions, serial numbers, reservations, loading sheets, batch genealogy | | NOT built | The web inventory page does not offer them either (the backend has most). Warehouses and bins have no create or edit endpoint used by the web page. |

### Catalogue (new screens)

| Feature | Route | Status | Test / note |
| --- | --- | --- | --- |
| Categories: tree list, add, edit (If-Match), merge, delete when empty | `/catalogue-categories` | DONE (mocked client) | `stk-catalogue` |
| Brands and manufacturers: list, add, edit brand, add manufacturer, duplicate warning asks then resends with the flag | `/catalogue-brands` | DONE (mocked client) | `stk-catalogue`. Manufacturer edit not built (web has none either). |
| Units of measure: list, add | `/catalogue-units` | DONE (mocked client) | `stk-catalogue` |
| Price lists: list, create, open, edit lines (code and price or percent), publish, end, revise, delete draft | `/price-lists` | DONE (mocked client) | `stk-catalogue`. Customer and category assignments are shown as a count only; editing them is NOT built. Lines are looked up by product code, one request per line. |
| Products with no HSN | `/catalogue-hsn` | DONE (mocked client) | `stk-catalogue`. Bulk tax update NOT built. |
| Product extras: alternate units (view, edit), tax mapping (view, change from a date), change history, composition (view), regulated flags (edit) | `/products/more?id=` (button on product detail) | DONE (mocked client) | `stk-catalogue`. Composition editing and new ingredients NOT built. |
| NOT built: bulk import and export of products, barcode label sheet and printing, product groups and variants, bundles, price tiers and quantity breaks, branch prices, substitutes, crop map, attribute definitions | | NOT built | Import, export and labels are file and printer work (printer choice belongs to the owner). The rest is in the backend but not on the web products page. |

### Purchase (new screens)

| Feature | Route | Status | Test / note |
| --- | --- | --- | --- |
| Suppliers: search, add (GSTIN and state code checked, opening balance), edit (If-Match), block with reason, activate, ledger, bank accounts add and verify, duplicate warning | `/purchase-suppliers` | DONE (mocked client) | `stk-purchase`. Contacts not built. |
| Goods receipts: post a draft, discard, approve over-receipt, reverse | `/purchase-receipts` | DONE (mocked client) | `stk-purchase`. Creating a receipt is on the existing receive screen. |
| Purchase bills: enter from receipt lines (three-way match is done by the server, quantity capped on screen), direct purchase with batch and expiry, post, discard, accept price variance, return goods with a debit note | `/purchase-bills` | DONE (mocked client) | `stk-purchase`. Journal entries view not built. |
| Pay a supplier (warns when the amount is above what is due) | `/pay-supplier` | DONE (mocked client) | `stk-purchase`. Manual allocation to bills and the TDS entry are NOT built. |
| Purchase reports: pending order quantities, purchase register | `/purchase-reports` | DONE (mocked client) | `stk-purchase`. No date range on the register. Payables ageing is on the earlier Bills and payables screen. |
| Order actions: send to supplier, revise, close the rest | `/purchase/more?id=` (button on order detail) | DONE (mocked client) | `stk-purchase`. Editing a draft order (PATCH) is NOT built. |
| NOT built: purchase requisitions, quotation requests (RFQ) and comparison, supplier claims, supplier return lifecycle (acknowledge, dispatch, settle, replacement), schemes and scheme claims, landed cost, supplier performance, goods receipt by barcode scan on the new screens | | NOT built | The web purchase page does not offer them (the backend has them). The existing receive screen already counts by barcode. |

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
