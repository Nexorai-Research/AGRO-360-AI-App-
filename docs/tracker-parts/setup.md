## Setup: financial years, tax, numbering, print templates, branches, warehouses and bins (web parity)

All rows: mocked API, not run against the real backend or on a phone. Paths, bodies, limits and permissions were copied from `apps/api/src/org.controller.ts`, `modules/org/src/domain/org.ts` and the web page `settings.js`. New routes `/setup-years`, `/setup-tax`, `/setup-numbering`, `/setup-print`, `/setup-branches`, `/setup-warehouses` (home module Setup). Texts are in `i18n-parts/setup.json` (English, Hindi, Marathi). Tests: `__tests__/setup-screens.test.tsx`.

| Feature | State | Test |
|---|---|---|
| Financial years: list, add the next year (start filled from the last year), months of a year | DONE (mocked) | `setup-screens.test.tsx` |
| Lock a month or a whole year (reason of 10+ letters; locked rows have no button) | DONE (mocked) | same |
| Tax rates: list, add or change a rate (rate as a decimal string, 0 unless the kind is GST, code in capitals) | DONE (mocked) | same |
| HSN mapping: list, map a 4, 6 or 8 digit code to a tax code | DONE (mocked) | same |
| Tax settings (composition dealer, rounding) saved with `If-Match` version | DONE (mocked) | same |
| Document numbering: pick branch and year, edit prefix, digits and next number of an unused series; a used series is shown as frozen; GST invoice numbers checked for 16 characters | DONE (mocked) | same |
| Print templates: paper, which fields print, terms and footer, saved with the version; HSN and licence numbers cannot be switched off where the server forbids it | DONE (mocked) | same |
| Branches: add, edit (only changed fields, `If-Match`), deactivate (reason), reactivate; head office cannot be deactivated | DONE (mocked) | same |
| Warehouses: add, edit name and type, deactivate (reason), reactivate | DONE (mocked) | same |
| Bins of a warehouse: list, add, switch on or off | DONE (mocked) | same |
| One Idempotency-Key per action, kept on retry after a lost answer, new when the body changes | DONE | same |

NOT built or limits:
- Print template preview (the server answers with a web page of sample data); use the web app.
- Branch manager choice and time zone are not editable here; the server keeps the existing values.
- GSTIN check digit and whether the state code is a real GST state are checked only by the server.
- Dates are typed as YYYY-MM-DD (no date picker). Lists show what the server sends, no paging.
- Hindi and Marathi texts need a native speaker review.
