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
