## Web parity, phase 2: purchase and catalogue

All rows: mocked API, not run against the real backend or a phone. Paths, bodies and checks copied from the web pages `purchase.js`, `products.js` and the backend `modules/procurement/src/application/adjustments.ts` (parseSupplierAdjustment), `modules/catalogue/src/domain/catalogue.ts` (parseAssignments, parseBulkTax), `modules/procurement/src/application/orders.ts` (updateOrder). Texts are in `i18n-parts/wp2.json`.

| Feature | State | Test |
|---|---|---|
| 2.1 Supplier credit / debit notes: list and post (credit names a posted bill; debit names none; account 5040 or 6030 by type; tax only with the supplier GST document; IGST or CGST + SGST). Shown next to Purchase bills | DONE | `__tests__/wp2.test.tsx` |
| 2.2 Edit a draft purchase order (`PATCH /procurement/purchase-orders/:id` with If-Match); "Edit draft" on the order; refused for a non-draft | DONE | `__tests__/wp2.test.tsx` |
| 2.3 Discard a draft purchase bill | Already built before this work (`stk/PurchaseScreens.tsx` BillCard) | existing tests |
| 2.4 Price list assignments (`PUT /price-lists/:id/assignments`, "SCOPE:id" per line like the web) | DONE | `__tests__/wp2.test.tsx` |
| 2.5 Bulk HSN / tax update with preview (`POST /products/bulk-tax-update`) on the Products with no HSN screen | DONE | `__tests__/wp2.test.tsx` |
