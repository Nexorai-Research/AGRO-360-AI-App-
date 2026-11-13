## AI and intelligence, slice 1: assistant chat and daily alerts (branch `web-gaps-3`)

Web side: M15 AI & Intelligence, 49 of 49 use cases marked DONE in `docs/modules/M15-status.md` of the web repo (read only). This branch builds the first two screens on the phone. All lines below: mocked API client, NOT run against the real backend, NOT run on a phone or emulator. Request and answer shapes were copied by hand from `apps/api/src/assistant*.ts`, `apps/api/src/ai-insights.controller.ts` and `modules/ai/src/domain/digest.ts` (no OpenAPI file yet). Texts are in `i18n-parts/ai.json` (English, Hindi, Marathi; Hindi and Marathi were written by the app team and need a native speaker review).

| Feature | Route | Status and evidence |
| --- | --- | --- |
| AI assistant chat: typed question, answer, new chat; the model's tool calls are run on the phone with the signed-in person's own token (`GET` of allowed areas only, open a screen, open a customer, change language) and their results go back to the model, at most 8 model calls per question | `/assistant` | DONE (mocked client). `__tests__/ai-screens.test.tsx`, `__tests__/ai-tools.test.ts` (41 tests in the two files). Uses `POST /assistant/chat`. |
| Changes made by the assistant (add customer, record payment, sign out) wait for a Yes card; the customer name is read back from the API; No changes nothing; amounts are decimal strings; every POST has its own Idempotency-Key; no tenant id is sent | `/assistant` | DONE (mocked client). `__tests__/ai-tools.test.ts`, `__tests__/ai-screens.test.tsx`. |
| Read allow-list and block-list for the assistant's `get` tool (same rules as the web) | `/assistant` | DONE. `__tests__/ai-tools.test.ts`. The server still decides what the person may read. |
| Daily alerts (digest): all branches or one, findings by severity, summary, hidden count, "not checked" warning, open the evidence screen, hide a finding for 7 days (needs `ai.recommendation.decide`) | `/ai-digest` | DONE (mocked client). `__tests__/ai-screens.test.tsx`. Uses `GET /ai/digest`, `POST /ai/digest/snooze`, `GET /branches`. |
| Errors: assistant not configured, service unavailable, rate limit, AI off, AI quota used up | both | DONE (texts). `__tests__/ai-screens.test.tsx` covers ASSISTANT_NOT_CONFIGURED; the others are text only. |

NOT built in this slice, and why:
- Voice input and spoken answers (the web uses the browser's speech); needs a native speech package and a device test.
- Streaming of words as they are written (`POST /assistant/chat/stream`); the phone waits for the whole answer. A React Native stream reader has not been tried.
- The assistant tools set_theme and toggle_header: the app has one theme and no top bar; the assistant says so.
- The assistant's `navigate` only opens screens that exist in the app; web-only names (engagement, territories, customer-tools, import-history, configuration) answer "no such screen".
- Digest: the inbox of scheduled runs (`/ai/inbox`), un-hide a hidden finding, weekly insights.
- Every other M15 screen: reports by question, forecast and seasonal planning, reorder suggestions, crop advisory and pest photo, weather alerts, credit risk and collection plan, churn, anomalies, pricing and expiry advice, multilingual search, voice billing, supplier invoice OCR, marketing drafts, AI actions and approvals, AI governance and quota.
- The conversation is kept in memory only; it is gone when the screen is closed.
- Link from the home screen: added as the module "AI assistant" in `src/features/home/modules.ts`; not seen on a real home screen.

## AI and intelligence, slice 2: stock and buying advice (branch `web-gaps-3`)

Same limits as slice 1: mocked API client, NOT run against the real backend, NOT run on a phone. Shapes copied by hand from `apps/api/src/{ai,ai-forecast,ai-actions,ai-feeds}.controller.ts` and `modules/ai/src/domain/{forecast-lab,seasonal,planning,basket,expiry,budget,price-check}.ts`. Forecast, basket and budget figures are plain numbers on the wire (statistics and estimates, not ledger money): the app only shows them (`src/features/ai/fmt.ts`) and does no arithmetic on them. The budget and price-change boxes are checked as decimals before they are sent. All tests: `__tests__/ai-stock.test.tsx` (32 tests), `__tests__/ai-tools.test.ts`, `__tests__/ai-screens.test.tsx`.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-251 Demand forecast per product and branch: next 4, 8 or 13 weeks, likely range from the product's own back-test error, "not enough data" with its reason, approved method shown | `/ai-forecast` | DONE (mocked client). `GET /ai/forecast/table`. Needs `ai.assistant.use` and `inventory.view`. First 40 products, "show more" asks for 200. |
| UC-252 Season plan: expected sales for a window, units to buy, order-by date, assumptions, products that cannot be planned keep their reason | `/ai-season` | DONE (mocked client). `GET /ai/planning/season/catalogue`. The window is chosen by "starts in" and "length" in weeks. |
| UC-253 Reorder suggestions: basket for a branch with supplier, lead time, shelf-life cut, budget shortfall; "Save as suggestions" stores them for a person to approve (nothing is ordered) | `/ai-reorder` | DONE (mocked client). `GET` and `POST /ai/reorder/basket`. Needs `purchase.view` too; the save button needs `ai.recommendation.decide`. |
| Suggestions list and approval (UC-269): list by status, detail without ids or hashes, "Check first" (dry run, writes nothing), approve with the hash that was shown, one-time token kept in memory only, make the draft, reject with a reason; two-person approval and "you may not approve" are shown | `/ai-recommendations`, `/ai-recommendation/:id` | DONE (mocked client). `GET /ai/recommendations`, `GET /ai/actions/:id`, `POST /ai/actions/:id/{dry-run,approve,execute}`, `POST /ai/recommendations/:id/reject`. Every POST has its own Idempotency-Key. |
| UC-263 Expiry advice: batches at risk with expected unsold, suggested discount and prices, fixed-price products blocked, another branch that can sell, supplier return; each can be saved as a suggestion | `/ai-expiry` | DONE (mocked client). `GET /ai/stock/expiry-plan`, `POST /ai/recommendations/expiry-{discount,transfer,return}`. Without `inventory.value.view` the cost is hidden, a warning shows and the discount button is hidden. |
| UC-376 Supplier price check: suppliers whose billed rates were above their own usual rates | `/ai-supplier-prices` | PARTLY. The supplier view (`GET /ai/anomalies/suppliers`) is DONE (mocked client). NOT built: the check of one rate before a bill line is posted (`POST /ai/anomalies/price-check`) needs a product and supplier picker. |
| UC-378 Budget what-if: which open reorder suggestions a budget (and optionally the books' spare cash) can pay for, with shelf risk per line | `/ai-scenario` | PARTLY. Budget, price change and cash limit are DONE (mocked client, `POST /ai/scenarios/budget`). NOT built: per-product demand change, the one-product scenario, saved scenarios. |
| UC-266 Supplier invoice OCR to draft bill | none | NOT BUILT. Needs the camera or a file picker and multipart upload of an image or PDF, then a review screen; not started. |
| Editing the quantity of a reorder suggestion (`PATCH /ai/recommendations/:id`), feedback and outcome on a suggestion, season by name | none | NOT BUILT. |

## AI and intelligence, slice 3: forecast accuracy and product checks (branch `web-gaps-3`)

Same limits: mocked API client, NOT run against the real backend, NOT run on a phone. Hindi and Marathi texts were written without a native reader and need review.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-372, 373, 374, 375 Forecast accuracy by branch, drifted products, drift scan, history; per-product Why / Accuracy / Drift / Season / Methods | `/ai-accuracy`, `/ai-product-check` | DONE (mocked client). Tests: `__tests__/ai-forecast-check.test.tsx`. |
| UC-387 Champion-challenger: save the chosen method for a product | `/ai-product-check` | PARTLY. Saving the choice is DONE (mocked). NOT built: shadow run and promotions. |

## AI and intelligence, slice 4: customers, cash, price and message drafts (branch `web-gaps-3`)

Same limits: mocked API client, NOT run against the real backend, NOT run on a phone. Every screen only reads advice or saves a suggestion for a person to approve; nothing is blocked, sent, ordered or changed.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-258 Credit risk per customer (band, score, reasons; customers with no history are not scored) | `/ai-customers` | DONE (mocked client). Needs `reports.receivables`. Tests: `__tests__/ai-customers.test.tsx`. |
| UC-259 Collection plan (rank, overdue, best day to pay, channel advice, blocked consent shown as a warning) | `/ai-customers` | DONE (mocked client). |
| UC-260 Customers who stopped buying or buy less | `/ai-customers` | DONE (mocked client). Needs `customer.view`. NOT built: repeat-purchase reminders, per-customer risk history. |
| UC-377 Cash outlook for 7, 14, 30 days, what is not included (payroll, GST) | `/ai-cashflow` | DONE (mocked client). Needs `reports.financial` and `reports.receivables`. |
| UC-262 Price advice per customer category; "Suggest this price" saves a suggestion (POST with an Idempotency-Key) | `/ai-pricing` | DONE (mocked client). Needs `pricing.manage` and `inventory.value.view`. |
| UC-267 Message text from a reviewed template, language and channel | `/ai-marketing` | PARTLY. Making the text and showing length, rule problems and notes is DONE (mocked). NOT built: saving it as a message draft (`/ai/recommendations/campaign-message`, body not read yet) and campaign drafts. Nothing is sent. |

## AI and intelligence, slice 5: farming advice (branch `web-gaps-3`)

Same limits: mocked API client, NOT run against the real backend, NOT run on a phone, and the photo picker is mocked in tests, so it was never tried with a real file. Matches come only from approved knowledge on the server; the app never invents advice.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-254 Crop doctor: crop, stage, symptoms and/or a photo (JPEG, PNG, WebP up to 3 MB, sent as base64 in `image.data`), candidates with control text, dose only when the entry states it, source; "Ask an expert" escalates a case | `/ai-crop-doctor` | DONE (mocked client and mocked picker). Tests: `__tests__/ai-agro.test.tsx`. NOT built: taking a photo with the camera (gallery or files only); the case list and expert answer screens. |
| UC-255 Products for an approved problem (staff only, stock at the branch, left-out products with reasons) | `/ai-problem-products` (opened from a candidate) | DONE (mocked client). |
| UC-256 Crop advisory by crop, stage and season, with a weather note | `/ai-advisory` | DONE (mocked client). |
| UC-257 Weather alerts for every branch location, with the forecast source and time, or the reason there is none | `/ai-weather` | DONE (mocked client). NOT built: setting up locations, rules or refreshing the forecast (admin screens). |
| Knowledge base review (add, approve, retire entries) | none | NOT BUILT. Needs `ai.governance.manage`. |
