## Web parity, phase 1: daily shop work

All rows: mocked API, not run against the real backend or a phone. Paths, bodies, checks and permissions were copied from the web pages `customers.js`, `collections.js`, `sales.js` and the backend `apps/api/src/{crm,crm-admin,collections,sales,inventory}.controller.ts` with `modules/customer`, `modules/credit` (parsers). The plan is `docs/WEB-PARITY-PLAN.md`. Texts are in `i18n-parts/wp1.json` (English, Hindi, Marathi).

| Feature | State | Test |
|---|---|---|
| 1.1 Open CRM tasks of a customer, mark done (`GET /crm/tasks?customerId&status=OPEN`, `POST /crm/tasks/:id/done`) | DONE | `__tests__/wp1-customer.test.tsx` |
| 1.2 Complaint assign to a person (`POST /complaints/:id/assign`) and supplier claim with a reference of 1 to 80 letters (`POST /complaints/:id/claim`), only while the ticket can still be worked | DONE | `__tests__/wp1-ops.test.tsx` |
| 1.3 Inputs applied: list, record (blank fields left out like the web), verify (`/customers/:id/applications`) | DONE | `__tests__/wp1-customer.test.tsx` |
| 1.4 Guarantors: list, add someone who is not a customer (name, mobile 6-9 start, relationship), remove. Picking an existing customer as guarantor is not built yet | PARTIAL | `__tests__/wp1-customer.test.tsx` |
| 1.5 KYC files: upload PDF/JPEG/PNG up to 2 MB as base64, download through the share sheet, remove after a confirm step | DONE | `__tests__/wp1-customer.test.tsx` |
| 1.6 Loyalty points history (`GET /customers/:id/loyalty/ledger`) | DONE | `__tests__/wp1-customer.test.tsx` |
| 1.7 Share the statement: language, link days 1 to 90, WhatsApp send; shows the link | DONE | `__tests__/wp1-customer.test.tsx` |
| 1.8 New household with the customer as SELF, decision maker and payer (`POST /crm/households`) | DONE | `__tests__/wp1-customer.test.tsx` |
| 1.9 Purchase history with season and year filter (`GET /customers/:id/purchases`). The web's "Reorder at the counter" button is not built yet | PARTIAL | `__tests__/wp1-customer.test.tsx` |
| 1.10 Credit / debit adjustments: list and post, account list per type, one key per form (collections desk, Adjustments tab) | DONE | `__tests__/wp1-ops.test.tsx` |
| 1.11 Sell reserved stock: active, unexpired reservations of the bill's branch; the reserved line goes on the bill; `reservationId` only on the finalized bill and only while that line is on it | DONE | `__tests__/wp1-ops.test.tsx` |
