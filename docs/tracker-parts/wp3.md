## Web parity, phase 3: accounts, GST and settings

All rows: mocked API, not run against the real backend or a phone. Copied from the web pages `compliance.js`, `finance-ops.js`, `settings.js`, `main.js` and the backend controllers. Texts are in `i18n-parts/wp3.json` (compliance labels in `i18n-parts/cmp.json`).

| Feature | State | Test |
|---|---|---|
| 3.1 Import a CSV bank statement with the column mapping (`POST /finance/bank-statements/import`) on the bank reconciliation screen | DONE | `__tests__/wp3.test.tsx` (mapping, path) |
| 3.2 Record a bank charge or interest from an unmatched statement line (`POST /finance/bank-lines/:id/entry`) | DONE | `__tests__/wp3.test.tsx` |
| 3.3 Download GSTR-1 as JSON or CSV (`GET /gst/gstr1/export`), saved and opened in the share sheet | DONE | `__tests__/wp3.test.tsx` (path) |
| 3.4 GSTR-2B match tab (`GET /gst/itc-reconciliation`) in Tax records. Importing the GSTR-2B file (`POST /gst/gstr2b/import`) is NOT built | PARTIAL | `__tests__/wp3.test.tsx` |
| 3.5 Compliance settings: view and change (`GET/PUT /compliance/settings`, If-Match) | DONE | `__tests__/wp3.test.tsx` |
| 3.6 Reverse charge rules tab with switch on / off (`PATCH /rcm/rules/:id`). Adding a rule (`POST /rcm/rules`) is NOT built | PARTIAL | `__tests__/wp3.test.tsx` |
| 3.7 Print template preview (`POST /settings/print-templates:preview`), shown as a PDF in the share sheet (the phone has no web view) | DONE | `__tests__/wp3.test.tsx` (path) |
| 3.8 "Sign-in seen" sent after every successful `/me`, best effort, like the web | DONE | full suite |

Note: the gap scan read the web's `api('METHOD', path)` calls. Calls made through page-local helpers (for example `post(...)` in `compliance.js`) were not read, so a few web features (such as adding an RCM rule and the GSTR-2B import) were found only while building. A second scan of those helpers is still to do.
