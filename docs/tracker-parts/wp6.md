## Web parity, phase 6: GST and TDS

All rows: mocked API, not run against the real backend or a phone. Copied from the web page `compliance.js` (itcTab, blocksTab, rcmTab, tdsTab); field rules from `modules/compliance/src/application/itc.ts`, `rcm.ts`, `tds.ts`. All on the tax records hub. Texts are in `i18n-parts/wp6.json`.

| Feature | State | Test |
|---|---|---|
| 6.1 Input credit tab: the month's purchase bills (`GET /gst/itc-register`), claim or block one with a reason (`POST /gst/bills/:id/itc-decision`, `compliance.itc.manage`) | DONE | `__tests__/wp6.test.tsx` |
| 6.2 GSTR-2B import of the portal JSON or a CSV for the month, rows that could not be read are counted (`POST /gst/gstr2b/import`, up to 5 MB) | DONE | `__tests__/wp6.test.tsx` |
| 6.3 Block the input credit of a product or category (`POST /gst/itc-blocks`). The web lists categories from `/categories`, which the server does not have; the app uses `/product-categories` | DONE | `__tests__/wp6.test.tsx` |
| 6.4 Add a reverse charge rule: unregistered suppliers, one supplier, or a category (`POST /rcm/rules`). Suppliers from `/procurement/suppliers` (the web's `/suppliers` does not exist) | DONE | `__tests__/wp6.test.tsx` |
| 6.5 Add a TDS / TCS section (`PUT /tax/tds-config`) | DONE | `__tests__/wp6.test.tsx` |
| 6.6 Run TDS / TCS for the month, shown only while TDS is on (`POST /tax/tds/run`); TDS on / off in the compliance settings card (`PUT /compliance/settings`, `tdsEnabled`) | DONE | `__tests__/wp6.test.tsx`, `__tests__/wp3.test.tsx` |
