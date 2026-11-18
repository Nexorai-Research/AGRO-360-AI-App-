## Web parity, phase 5: AI

All rows: mocked API, not run against the real backend or a phone. Copied from the web pages `ai.js` and `ai-analytics.js`. Owner parts need `ai.governance.manage`, like the web. Texts are in `i18n-parts/wp5.json`.

| Feature | State | Test |
|---|---|---|
| 5.1 AI inbox: list, mark one read, mark all read (`/ai/inbox`); on the AI digest screen | DONE | `__tests__/wp5.test.tsx` |
| 5.2 AI settings: on / off, monthly calls, margin, cash, shop hours (`GET/PUT /ai/settings`, If-Match); on AI governance | DONE | `__tests__/wp5.test.tsx` |
| 5.3 Search aliases: counts, add, switch on / off with the version (`/ai/search/aliases`); on AI governance. The web's product search box on that tab is not repeated here | DONE | `__tests__/wp5.test.tsx` |
| 5.4 Campaign drafts and a campaign message from the assistant (`GET /ai/campaigns/drafts`, `POST /ai/recommendations/campaign-message`) | NOT BUILT | - |
| 5.5 Weather: branch locations, rules, fetch now (`/ai/weather/locations`, `/rules`, `/refresh`); on the weather screen | DONE | `__tests__/wp5.test.tsx` |
| 5.6 Agro knowledge CSV import: checked first (nothing saved), then imported as drafts (`POST /ai/agro/knowledge/import`); on advisory | DONE | `__tests__/wp5.test.tsx` (logic only; the file picker is not exercised) |
| 5.7 Crop requirement factors: list, add, change (expectedVersion), remove (`/ai/crops/factors`); on the crop map | DONE | `__tests__/wp5.test.tsx` |
| 5.8 Ask the AI what to reorder: stock-out check first, a reorder recommendation only when it says RECOMMEND (`POST /ai/forecast/stockout`, `/ai/recommendations/reorder`); on forecast | DONE | `__tests__/wp5.test.tsx` |
| 5.9 OCR document review before confirm (`PUT /ai/ocr/documents/:id/review`) | NOT BUILT | - |
