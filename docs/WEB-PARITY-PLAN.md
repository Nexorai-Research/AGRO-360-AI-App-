# Web parity plan: what the web app has that the mobile app does not

Compared: web app `apps/web/src` and backend `apps/api/src` of `Nexorai-Research/AGRO-360-AI` (HEAD `2343b9b`, read only) against this app's `src/`. Branch for the work: `web-parity`.

## How the gap was found

1. Every API call in the web (`api('METHOD', '/path')`) and in the app (`client.get/post/...('/path')`) was extracted and normalised (ids become `:id`, query strings dropped, local path helpers such as `base(id)` resolved).
2. Web: 569 distinct endpoints. App: 523. Matched directly: 410. Not matched: 159.
3. Each of the 159 was then searched for by its distinctive path words in the app source, because the app builds some URLs at runtime (for example `adjustments/${id}/${action}`). About 90 turned out to exist already.
4. The rest was matched against the backend controllers to get each route's permission (`@RequirePermission`). All 65 endpoints below exist in the backend.

Rules for every item:
- Same API, same request fields, same checks and messages as the web.
- The app's current UI stays as it is. New parts use the existing kit (`src/ui`, feature `kit.tsx` files) and sit inside the screens listed.
- A part is shown only when `me.permissions` has the permission (the server still decides).
- Every mutation sends an `Idempotency-Key` per user action; edits send `If-Match`; money stays a decimal string.

## Phase 1: daily shop work

| # | Feature | Endpoints | Permission | What the web does | Where in the app |
|---|---|---|---|---|---|
| 1.1 | CRM tasks: open tasks of a customer, mark done | `GET /crm/tasks?customerId&status=OPEN`, `POST /crm/tasks/:id/done` (body `{}`) | `customer.interaction` | Customer activity tab lists open tasks with a Done button | `customers/ServicePanel.tsx` (activity), API in `customers/crm-api.ts` |
| 1.2 | Complaint assign and warranty claim | `POST /complaints/:id/assign` `{assigneeUserId}`, `POST /complaints/:id/claim` `{reference}` | `customer.complaint.resolve` | Assign: pick a user. Claim: dialog "Claim reference" (required) | complaint detail in `features/complaints`, API in `complaints/api.ts` |
| 1.3 | Inputs applied (agri applications): list, record, verify | `GET/POST /customers/:id/applications`, `POST .../applications/:id:verify` | view `customer.view`; record/verify `agri.application.record` | Form drops empty fields; row shows "verified" or Verify button | new section in `customers/MoreSections.tsx` |
| 1.4 | Guarantors: add, remove | `POST /customers/:id/guarantors` `{relationship, ..., limitCovered}`, `DELETE .../guarantors/:gid` | `credit.guarantor` | Add form with amount covered; Remove per row | `customers/CreditPanel.tsx` (list already shown) |
| 1.5 | KYC documents: upload, download, remove | `POST /customers/:id/documents` `{docType, file base64}`, `GET .../documents/:id/content`, `POST .../documents/:id:remove` | upload/remove `customer.kyc`; download `customer.view` | Max 2 MB, PDF/JPEG/PNG; remove asks to confirm ("The file is erased") | KYC section in `customers/MoreSections.tsx`; file pick with `expo-document-picker`, open with `expo-sharing` |
| 1.6 | Loyalty points ledger | `GET /customers/:id/loyalty/ledger` | `customer.view` | Ledger table under the loyalty summary | loyalty section in `customers/MoreSections.tsx` |
| 1.7 | Share customer statement | `POST /customers/:id/statement/share` `{language?, ttlDays (default 30), send}` | `receipt.create` | Dialog: language, link valid days, "Send it on WhatsApp now"; shows the link | `customers/CreditPanel.tsx` or statement screen |
| 1.8 | New household | `POST /crm/households` `{name, decisionMakerId, payerId, members:[{customerId, relationship:'SELF'}]}` | `crm.household.manage` | "New household" with one field when the customer has none | household section in `customers/MoreSections.tsx` |
| 1.9 | Purchase history with season filter | `GET /customers/:id/purchases?limit=200&season&year` | `customer.view` | Table with season and year filter | customer 360, new section |
| 1.10 | Credit adjustments: list, post | `GET /credit/adjustments`, `POST /credit/adjustments` | list `reports.receivables`; post `credit.adjustment` | Debit only to allowed accounts, credit only to allowed accounts (same lists as web, e.g. 4910 Charges recovered) | `collections/DeskScreen.tsx` new tab, API in `collections/sal-api.ts` |
| 1.11 | Use a stock reservation in billing | `GET /inventory/reservations?status=ACTIVE&limit=200` | `inventory.view` | Takes active, unexpired reservations of the cart's branch into the cart; error "No active reservation for this branch." | `pos/PosScreen.tsx`, API in `pos/api-more.ts` |

## Phase 2: purchase, catalogue and stock

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 2.1 | Supplier debit/credit notes: list, create | `GET/POST /procurement/supplier-adjustments` | view `purchase.supplier.ledger.view`; create `purchase.supplier.adjustment` | `stk/PurchaseScreens.tsx` (supplier money) |
| 2.2 | Edit a draft purchase order | `PATCH /procurement/purchase-orders/:id` | `purchase.order.create` | `purchase/OrderFormScreen.tsx` |
| 2.3 | Delete a draft purchase bill | `DELETE /procurement/purchase-bills/:id` | `purchase.bill.create` | Found already built (`stk/PurchaseScreens.tsx`, via the `w.del` helper the scan did not read) |
| 2.4 | Price list customer assignments | `PUT /price-lists/:id/assignments` | `pricing.manage` | price list screen in `stk/CatalogueScreens.tsx` |
| 2.5 | Bulk HSN/tax update | `POST /products/bulk-tax-update` | `product.tax.manage` | missing-HSN screen in `stk/CatalogueScreens.tsx` |

## Phase 3: accounts, GST and settings

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 3.1 | Bank statement import | `POST /finance/bank-statements/import` | `finance.bankrec.manage` | `finance/BankScreen.tsx` |
| 3.2 | Book entry from a bank line | `POST /finance/bank-lines/:id/entry` | `finance.bankrec.manage` | `finance/BankScreen.tsx` |
| 3.3 | GSTR-1 export file | `GET /gst/gstr1/export` | `compliance.gst.view` | `compliance/Gstr1Screen.tsx` |
| 3.4 | ITC reconciliation | `GET /gst/itc-reconciliation` | `compliance.gst.view` | compliance hub tabs (`compliance/cmp-tabs.ts`) |
| 3.5 | Compliance settings | `GET/PUT /compliance/settings` | view `compliance.gst.view`; edit `compliance.settings.manage` | compliance hub |
| 3.6 | RCM rules edit | `GET /rcm/rules`, `PATCH /rcm/rules/:id` | view `compliance.gst.view`; edit `compliance.rcm.manage` | compliance hub |
| 3.7 | Print template preview | `POST /settings/print-templates:preview` | `org.print.manage` | print settings (`setup/api.ts`) |
| 3.8 | "New sign-in" notice acknowledged | `POST /me/sign-in-seen` | `identity.session.view` | account / security screen |

## Phase 4: reports

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 4.1 | Branch dashboard | `GET /reports/dashboard/branch` | `reports.sales` | reports screen |
| 4.2 | Seasons | `GET /reports/seasons`, `PUT /reports/seasons` | view `reports.sales`; edit `reports.financial` | reports settings |
| 4.3 | Custom report datasets | `GET /reports/custom/datasets` | `reports.sales` | `reportsmore` |
| 4.4 | Saved views: rename, delete | `PATCH/DELETE /reports/views/:id` | `reports.sales` | `reportsmore` (create exists) |

## Phase 5: AI

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 5.1 | AI inbox | `GET /ai/inbox`, `POST /ai/inbox/:id/read`, `POST /ai/inbox/read-all` | `ai.assistant.use` | AI home |
| 5.2 | AI settings | `GET/PUT /ai/settings` | `ai.governance.manage` | AI governance screen |
| 5.3 | Search aliases | `GET /ai/search/aliases`, `POST /ai/search/aliases`, `POST .../:id/active` | view `product.view`; change `ai.governance.manage` | AI governance |
| 5.4 | Campaign drafts and message | `GET /ai/campaigns/drafts`, `POST /ai/recommendations/campaign-message` | `ai.assistant.use` | `ai/MarketingScreen.tsx` |
| 5.5 | Weather locations, rules, refresh | `GET /ai/weather/locations`, `PUT .../locations/:id`, `GET /ai/weather/rules`, `PUT .../rules/:id`, `POST /ai/weather/refresh` | `ai.governance.manage` | `ai/WeatherScreen.tsx` |
| 5.6 | Agro knowledge import | `POST /ai/agro/knowledge/import` | `ai.governance.manage` | `ai/AdvisoryScreen.tsx` |
| 5.7 | Crop factors | `GET /ai/crops/factors` (`ai.assistant.use`), `POST/PUT/DELETE` (`ai.governance.manage`) | as listed | `ai/CropMapScreen.tsx` |
| 5.8 | Reorder recommendation, stock-out forecast | `POST /ai/recommendations/reorder`, `POST /ai/forecast/stockout` | `ai.assistant.use` | `ai/ForecastScreen.tsx` |
| 5.9 | OCR document review | `PUT /ai/ocr/documents/:id/review` | `ai.assistant.use` | `ai/BillScan` screen |

## Second scan (after phase 5)

The first scan read only `api('METHOD', path)`. The second scan (`endpoints2.mjs`) also reads the web's page helpers (`post(...)`, `list(...)`, `apiText`, `apiBlob`, `reasonCall`, `registerTab`, `C('x')`) and the app's `.del(...)`. It found 147 web endpoints not called the same way in the app. 76 of them the app already calls with a built path (for example `/hr/leaves/${id}/${decision}`, `/credit/${kind}/${id}/${what}`, `/ai/actions/:id/approve`); checked by hand. The rest are below. The web's `/categories` and `/suppliers` do not exist on the server (the web falls back to an empty list); the app uses `/product-categories` and `/procurement/suppliers`.

## Phase 6: GST and TDS (web `compliance.js`)

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 6.1 | Claim or block the input credit of one purchase bill, with a reason | `GET /gst/itc-register`, `POST /gst/bills/:id/itc-decision` | view `compliance.gst.view`; decide `compliance.itc.manage` | Tax records, new tab "Input credit" |
| 6.2 | GSTR-2B import (portal JSON or CSV) | `POST /gst/gstr2b/import` | `compliance.itc.manage` | Tax records, GSTR-2B tab |
| 6.3 | Block input credit of a product or category | `POST /gst/itc-blocks` | `compliance.itc.manage` | Tax records, blocked credit tab |
| 6.4 | Add a reverse charge rule | `POST /rcm/rules` | `compliance.rcm.manage` | Tax records, RCM rules tab |
| 6.5 | Add a TDS / TCS section | `PUT /tax/tds-config` | `compliance.tds.manage` | Tax records, TDS sections tab |
| 6.6 | Run TDS / TCS for the period; switch TDS on / off | `POST /tax/tds/run`, `PUT /compliance/settings` (`tdsEnabled`) | `compliance.tds.manage`; `compliance.settings.manage` | Tax records, TDS report tab and settings card |

## Phase 7: catalogue (web `products.js`)

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 7.1 | Download the products CSV and the import template | `GET /products/export`, `GET /products/import/template` | export `product.export` | Import history screen |
| 7.2 | Product import: check, then import all or nothing / valid rows only, report | `POST /products/import`, `POST /products/import/:job/commit` | `product.import` | Import history screen |
| 7.3 | Edit composition; add an ingredient to the master | `GET/POST /ingredients`, `PUT /products/:id/composition` | `product.update` (ban: `product.regulated`) | Product more, composition tab |
| 7.4 | Label sheet (name, pack, MRP, price, barcode) as a PDF | `GET /labels` | `product.view` | Catalogue |

## Phase 8: agri compliance and printouts (web `compliance-agri.js`, `customers.js`, `finance.js`)

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 8.1 | Licences hub: add registration, authorisation, vault document, restriction; check expiries now | `POST /compliance/registrations`, `/authorisations`, `/documents`, `/restricted-ingredients`, `/alerts/run` | each tab's manage permission | Licences hub |
| 8.2 | Audit pack ZIP for a month | `POST /compliance/audit-pack` | `compliance.evidence.export` | Licences hub, vault |
| 8.3 | Who is hit by a restricted ingredient | `GET /compliance/restricted-ingredients/impact` | `compliance.registers.view` | Licences hub |
| 8.4 | Report templates: list, add, approve, generate | `GET/POST /compliance/report-templates`, `POST /compliance/report-template-versions/:id/approve`, `POST .../:id/generate` | `compliance.reports.manage` / `.approve` | Licences hub |
| 8.5 | Seed lots | `POST /compliance/seed-lots` | `compliance.seed.manage` | Registers hub |
| 8.6 | Recalls, quarantine, cases, incidents, samples, authenticity: add and every step | `POST /compliance/recalls` (+ `quarantine`, `close`), `/quarantine` (+ `release`, `dispose`), `/cases` (+ `triage`, `escalate`, `close`), `/incidents`, `/samples` (+ `result`, `custody`), `/authenticity-checks` | as the web | Safety hub |
| 8.7 | Rules and rule versions | `POST /compliance/rules`, `POST /compliance/rule-versions/:id/{test,submit,approve,activate,retire}` | `compliance.rules.manage` / `.approve` | Safety hub |
| 8.8 | Batch trace (supplier to customer) | `GET /compliance/trace` | `compliance.trace.view` | Safety hub |

## Phase 9: finance, HR and settings (third scan)

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 9a.1 | Cost centres: add, change | `POST /finance/cost-centres`, `PATCH /finance/cost-centres/:id` | as the web | Finance |
| 9a.2 | Edit a draft voucher; edit a draft expense; new budget | `PUT /finance/vouchers/:id`, `PUT /finance/expenses/:id`, `POST /finance/budgets` | as the web | Finance |
| 9a.3 | Add a leave type | `POST /hr/leave-types` | as the web | HR |
| 9a.4 | Shop licences: list, add, change | `GET/POST /licences`, `PATCH /licences/:id` | `org.licence.manage` | Settings |
| 9a.5 | Printable customer statement (PDF) | `GET /customers/:id/statement.html` | `customer.ledger.view` | Customer screen |
| 9a.6 | Goods received not invoiced report | `GET /procurement/reports/grni` | `reports.purchase` | Purchase reports |

## Phase 10: AI and the earlier leftovers

| # | Feature | Endpoints | Permission | Where in the app |
|---|---|---|---|---|
| 9.1 | Run the daily AI scan now | `POST /ai/jobs/run` | `ai.governance.manage` | AI inbox |
| 9.2 | Campaign drafts and a campaign message (was 5.4) | `GET /ai/campaigns/drafts`, `POST /ai/recommendations/campaign-message` | `ai.assistant.use` | AI marketing |
| 9.3 | OCR review before confirm (was 5.9) | `GET /ai/ocr/documents/:id`, `PUT /ai/ocr/documents/:id/review` | `ai.assistant.use` | Bill scan |
| 9.4 | An existing customer as guarantor | `POST /customers/:id/credit/guarantors` (customerId) | as 1.6 | Customer, guarantors |
| 9.5 | Reorder at the counter from purchase history | as the web `customers.js` | `sales.create` | Customer, purchase history |

Not repeated in the app: the web's streamed chat (`/assistant/chat/stream`); the app's chat calls `/assistant/chat` and gets the same answer in one piece.

## Owner decisions still open (CLAUDE.md rule 10)

| Item | Question |
|---|---|
| Platform admin (`/platform/*`: franchises, plans, subscriptions, platform audit and dashboard) | Operator console for all franchises. Needed on the phone? |
| Observability (`/observability/*`, `/platform/observability/*`) | Shows how individual staff use the app. Needed, and who may see it? |
| Usage telemetry (`POST /observability/events`) | Sends usage events from the phone. Allowed? |
| Languages | Web: 22 Indian languages. App: English, Hindi, Marathi. Add the rest? |
| Offline billing | Web has an offline journal and sync (`src/offline/*`). Match it in the app? |

Until answered, these are not built.

## Steps per feature

1. Read the web page code and the backend handler (`modules/*/src/application`) for exact fields, validation and errors.
2. API function in the feature's `api.ts`.
3. UI inside the listed screen, with the existing kit, permission-gated.
4. Texts in `en.json`, `hi.json`, `mr.json`.
5. Jest test for the API call and the screen. `npm run lint`, `npm run typecheck`, `npm test` must pass.
6. Line in `docs/TRACKER.md`.
7. Commit per feature on `web-parity`; one pull request per phase into `main`.
8. Extend the local mock server so the feature can be seen on the emulator.

## Limits

- Tested against mocked APIs only; there is no staging URL yet. Nothing is checked against real data.
- This finds missing API use. A screen that calls the same API but shows fewer fields or filters than the web is not caught here; each phase also compares those pages side by side.
