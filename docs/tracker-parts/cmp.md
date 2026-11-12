## Compliance parity (GST returns, tax records, agri registers, licences, recalls and safety)

All lines: mocked API, not run against the real backend. Response field names were copied from the web pages, not from a live server. Evidence: `__tests__/cmp-screens.test.tsx` (23 tests passing). The app shows what the server computes; it computes no tax.

DONE:
- GSTR-1 (`/gstr1`, `compliance.gst.view`): summary, register checks, warnings, sections B2B, B2C large, B2C small, credit notes, exempt, HSN, documents, amendments (`GET /gst/gstr1`); freeze a GSTR-1 or GSTR-3B snapshot after a confirm, with warnings acknowledged (`POST /gst/gstr1/snapshot`, `/gst/gstr3b/snapshot`, needs `compliance.gst.snapshot`, one Idempotency-Key reused on retry). Test: cmp-screens.
- Tax records (`/tax-records`): reverse-charge entries with reverse after confirm (`POST /rcm/entries/:id/reverse`), blocked credit list with remove (`POST /gst/itc-blocks/:id/remove`), TDS/TCS report for the month (`GET /reports/tds`), TDS/TCS sections (`GET /tax/tds-config`), frozen returns list (`GET /gst/snapshots`). Test: cmp-screens.
- Agri registers (`/agri-registers`): pesticide, fertiliser and seed registers by month, seed lots (`GET /compliance/*-register`, `/compliance/seed-lots`). Test: cmp-screens.
- Licences (`/licences`): product registrations with suspend (reason, If-Match) and restore (If-Match), dealer authorisations with revoke, document vault list, open expiry alerts with acknowledge, renewal tasks with mark done, restricted ingredients with withdraw (reason). Test: cmp-screens.
- Recalls and safety (`/recalls-safety`): recalls, quarantine, cases, incidents, samples, authenticity checks, sale-check decisions (`GET /compliance/evaluations`), rules (view). Test: cmp-screens.
- Each screen has loading, empty, error with correlation id, offline and permission-denied states in English, Hindi and Marathi; tabs and buttons are hidden without the permission (the server still decides).

NOT built (view only or absent):
- GSTR-1 JSON/CSV download and GSTR-3B CSV export: needs saving a file on the phone; not built.
- GSTR-2B import and reconciliation, ITC decision per bill, add ITC block, RCM rules and posting RCM from a bill: forms and file import not built.
- TDS/TCS run, add section, switch on or off, compliance settings (PUT with If-Match): not built; tax policy for the owner and tax adviser.
- Creating records (registration, authorisation, document, restricted ingredient, seed lot, renewal task, recall, case, incident, sample, quarantine, authenticity check) and later steps (renew, recall scope, notify, send notices, return, close, triage, decide, custody, result, release, dispose): not built; list and view only for now.
- Rule authoring and approval, report templates and generated runs, evidence packs and audit pack download, batch trace, document access log, override report: not built.
- E-invoice and e-way bill: the backend has no endpoint in these controllers (GSP provider parts are blocked), so nothing is built. Fertiliser subsidy and POS machine reports: no endpoint found in these controllers.
- Row actions send an empty body or `{reason}`; the withdraw, revoke and suspend body fields were taken from the web page, not checked against the server validators.
