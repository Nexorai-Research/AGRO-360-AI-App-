
## AI and intelligence, group 4 rest: scans, shelf photo, villages, crop map, cases (branch `web-gaps-3`)

Same limits: mocked API client and mocked file picker, NOT run against the real backend, NOT run on a phone, no file was ever picked on a real device. Tests: `__tests__/ai-g4.test.tsx` (14). Hindi and Marathi texts were written without a native reader and need review. Nothing here posts a bill, creates a product or changes stock.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-266 Supplier bill scan: PDF, PNG or JPEG up to 4 MB (base64), fields with how sure each is, low ones flagged, checks (sum, GSTIN, date, duplicate) listed, same file again shows the earlier result, reject | `/ai-bill-scan` | PARTLY (mocked). Needs `purchase.bill.create`. NOT built: correcting the fields (`PUT /ai/ocr/documents/:id/review`), choosing the supplier and receipt lines, and confirming into a draft purchase bill. The camera is not used; files only. |
| UC-G09 Product label scan: same read and checks; "Use as product draft" shows the prefilled form | `/ai-label-scan` | PARTLY (mocked). Needs `product.create`. NOT built: correcting fields, and opening the product form with the draft filled in; no product is created. |
| UC-G16 Shelf photo check: pick a warehouse and a photo (JPEG, PNG, WebP up to 4 MB), estimate next to system stock with a flag per product; "Open a stock count" for the differences (once) | `/ai-shelf-check` | DONE (mocked). Needs `inventory.view`; the count button needs `inventory.adjust.create`. The camera is not used; files only. Stock is never changed. |
| UC-G11 Village trends: trend, change, customers, bills, sales, overdue, season demand, villages hidden for too few customers | `/ai-villages` | DONE (mocked). NOT built: choosing the period length and number of periods. |
| UC-G12 Crop map (acres per village and crop as bars) and predicted shortage with an order lead-time choice; says so when no requirement factors are entered | `/ai-crop-map` | DONE (mocked). NOT built: entering requirement factors (admin, `ai.governance.manage`), horizon choice. |
| Crop doctor cases: list by escalation state; a person with `ai.governance.manage` writes the expert answer | `/ai-cases` | DONE (mocked). NOT built: opening one case, and the knowledge base review. |
