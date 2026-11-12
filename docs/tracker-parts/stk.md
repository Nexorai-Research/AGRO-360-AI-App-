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
