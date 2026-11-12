## Customer 360: crop plans, purchase plans, service cases, contacts, preferences, access log, status and anonymise (web parity)

All rows: mocked API, not run against the real backend or on a phone. Paths, bodies, limits and permissions were copied from `apps/api/src/{agri,crm,crm-admin,sales}.controller.ts` and `modules/customer/src/domain/{agri,crm,privacy}.ts`. New cards on the customer page (`app/customers/[id].tsx`), each closed until opened so nothing is read before. Texts are in `i18n-parts/custx.json` (English, Hindi, Marathi). Tests: `__tests__/custx-panels.test.tsx`, 16 passed.

| Feature | State | Test |
|---|---|---|
| Crop plans: list, add (crop from the master, season, year, plot, area as a decimal string and unit, sowing date, intercrop), move to sown / growing / harvested (date, yield) or abandon (reason); only the moves the server allows are offered | DONE (mocked) | `custx-panels.test.tsx` |
| Seasonal purchase plans: list, add one line, confirm a draft with the farmer | DONE (mocked) | same |
| Service cases: list and record a query, visit or advice; advice must name its source and reference | DONE (mocked) | same |
| Extra contacts: list, add (10 digit mobile), remove (`crm.household.manage`) | DONE (mocked) | same |
| Communication preferences: view and change with `If-Match` version (channel, quiet hours, weekly limit); only changed fields sent | DONE (mocked) | same |
| Document access log (`customer.privacy`) | DONE (mocked) | same |
| Make a customer inactive or active again (`customer.update`) | DONE (mocked) | same |
| Anonymise (`customer.privacy`): reason and the exact text `ANONYMIZE <code>` must be typed | DONE (mocked) | same |
| One Idempotency-Key per action, kept on retry, new when the body changes | DONE | same |

NOT built or limits:
- Adding a crop to the master list, crop stage log, editing a crop plan (only the status moves) and the purchase plan variation view.
- A purchase plan is entered with one item; more lines and editing a plan are not built.
- Service case: no photos, no linked crop plan, no status change after saving.
- Households (`POST /crm/households`), crop-input applications and their verify step, and sharing the statement (`/statement/share`) are not built.
- Dates are typed as YYYY-MM-DD (no date picker). Lists show what the server sends, no paging.
- Hindi and Marathi texts need a native speaker review.
