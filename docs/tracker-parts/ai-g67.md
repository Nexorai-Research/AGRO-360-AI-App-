
## AI and intelligence, slice 6 and 7: risks, data quality, governance (branch `web-gaps-3`)

Same limits: mocked API client, NOT run against the real backend, NOT run on a phone. Shapes copied by hand from the controllers; tests in `__tests__/ai-g67.test.tsx`. Hindi and Marathi texts were written without a native reader and need review. Policy thresholds and budgets are plain numbers on the wire (not money strings) and are sent as numbers.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-385 Risk register: open counts by severity, filter by status, "Scan now" (needs `ai.recommendation.decide`) | `/ai-risks` | DONE (mocked client). |
| UC-389 Risk case: timeline notes, acknowledge, resolve or dismiss with a reason of 3 to 500 characters, due date, reopen by a person with `ai.governance.manage`; evidence is listed read-only | `/ai-risk?id=` | PARTLY. Notes, status, due date, reopen are DONE (mocked). NOT built: assigning to a person (needs a user picker), adding evidence, overdue list and risk trend. |
| UC-261 Transaction anomaly findings | `/ai-risks` | PARTLY. They appear as register entries and in the daily digest; there is no separate anomaly screen for discount, return and cashier patterns. |
| UC-381 Data-quality dashboard: overall score, score per source with issues, branches not scanned (needs `inventory.view`) | `/ai-quality` | DONE (mocked client). NOT built: history chart and per-branch stock detail. |
| UC-270 Governance: monthly quota used and left, who sets the limit, evaluation report counts for 30, 90, 180 days (needs `ai.governance.manage`) | `/ai-governance` | PARTLY. Quota and report summary DONE (mocked). NOT built: the CSV download, editing the franchise quota (`PUT /ai/settings`), the full evaluation tables. |
| UC-383 Approval policy per action (distinct approver, second approver, validity minutes, owner and second-approver limits) saved with `If-Match` version; action limits (reorder budget, transfer cost) | `/ai-policies` | PARTLY. Policies and action limits DONE (mocked). NOT built: designated approvers (`GET/PUT /ai/approvers`, needs a user picker). |
| UC-382 Feedback on a suggestion (helpful, not helpful, wrong, already knew, note) | `/ai-rec-followup?id=` | DONE (mocked client). NOT linked yet from the suggestion detail screen (another slice's file); open it with the suggestion id. |
| UC-388 Outcome of a suggestion: measured from the stock ledger, or the received quantity entered by the person, with the source shown | `/ai-rec-followup?id=` | DONE (mocked client). Needs `ai.recommendation.decide`. Same link limit as above. |
| UC-390 Decision log: summary by tool, model and outcome; latest 50 calls filtered by outcome (needs `ai.audit.view`) | `/ai-audit` | PARTLY. Summary and log DONE (mocked). NOT built: filters by tool, person and date, and the per-recommendation provenance view. |
