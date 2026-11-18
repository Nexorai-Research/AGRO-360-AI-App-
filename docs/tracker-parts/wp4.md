## Web parity, phase 4: reports

All rows: mocked API, not run against the real backend or a phone. Copied from the web page `reports.js` (seasonalTab, builder, customTab, branchDashTab) and `modules/reporting/src/application/{seasons,views}.ts`. Texts are in `i18n-parts/wp4.json`.

| Feature | State | Test |
|---|---|---|
| 4.1 Branch dashboard for today (`GET /reports/dashboard/branch?branchId`): tiles, sales by hour, top products, notes; on the Branches report | DONE | `__tests__/wp4.test.tsx` |
| 4.2 Season months: view and change (`GET/PUT /reports/seasons`, If-Match), "CODE, Name, first, last" per line; needs `reports.financial` | DONE | `__tests__/wp4.test.tsx` |
| 4.3 New custom report from the server's dataset list (`GET /reports/custom/datasets`, `POST /reports/views`): columns, add up by, one filter, most rows, shared roles | DONE | `__tests__/wp4.test.tsx` |
| 4.4 Change (`PATCH /reports/views/:id`, If-Match) and delete (`DELETE`, after a confirm) of your own report; a shared one is only run | DONE | `__tests__/wp4.test.tsx` |
