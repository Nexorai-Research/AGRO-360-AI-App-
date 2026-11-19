## Web parity, phase 8: agri compliance

All rows: mocked API, not run against the real backend or a phone. Copied from the web page `compliance-agri.js`: every add / run dialog and every step dialog, field for field. The web form checks only required fields, real dates, months and numbers; the app checks the same and the server decides the rest. Forms are defined in `src/features/compliance/cmp-forms.ts` and drawn by `CmpForm.tsx` inside the existing hubs. Texts are in `i18n-parts/wp8.json`.

Found by the third scan (method-aware; it also reads the web's `post(C('...'))` calls), which the first two scans missed.

| Feature | State | Test |
|---|---|---|
| 8.1 Licences hub: add a product registration, a dealer authorisation (manufacturer / brand lists), a vault document, a restriction (global list only with `compliance.restricted.global`); "check expiries now" (`POST /compliance/alerts/run`) | DONE | `__tests__/wp8.test.tsx` |
| 8.2 Audit pack for a month (`POST /compliance/audit-pack`): the ZIP from the answer is saved and handed to the share sheet | DONE | `__tests__/wp8.test.tsx` |
| 8.3 Affected stock of restricted ingredients (`GET /compliance/restricted-ingredients/impact`, its `products` list; the web reads `items` / `rows` and shows nothing) | DONE | `__tests__/wp8.test.tsx` |
| 8.4 Report templates: list with the newest version, add, approve the draft (`compliance.reports.approve`), generate for dates | DONE | `__tests__/wp8.test.tsx` |
| 8.5 Registers: add a seed lot for a batch | DONE | `__tests__/wp8.test.tsx` |
| 8.6 Safety hub: open a recall (optional batch scope), quarantine its stock, close with a note; quarantine a batch, release (`compliance.quarantine.approve`) or dispose; log a case, triage, escalate, close; report an incident; take a sample, record a result or custody; record an authenticity check | DONE | `__tests__/wp8.test.tsx` |
| 8.7 Rules: add a rule (condition must be JSON), every version listed with test / submit / approve / activate / retire by status and permission | DONE | `__tests__/wp8.test.tsx` |
| 8.8 Batch trace: pick a batch, receipts, sales, returns, totals and whether it agrees with the stock ledger (`GET /compliance/trace`) | DONE | `__tests__/wp8.test.tsx` |
| The web's "Open" on a recall shows the raw recall as JSON; not repeated in the app | NOT BUILT | - |
