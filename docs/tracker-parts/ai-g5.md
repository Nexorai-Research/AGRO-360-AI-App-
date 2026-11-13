
## AI and intelligence, slice 6: reports, strategy, branches, expansion (branch `web-gaps-3`)

Same limits: mocked API client, NOT run against the real backend, NOT run on a phone. Hindi and Marathi texts were written without a native reader.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-250 / UC-380 Ask a report in words: understood plan, summary, table; clarifying options and name choices (branch, product, customer) re-run with the chosen id; follow-up keeps the earlier answer's memory | `/ai-report` | DONE (mocked client). The report runs under the person's own access on the server. Tests: `__tests__/ai-g5.test.tsx`. NOT built: saved filter sets. |
| UC-379 Save the written summary as a draft; list saved drafts | `/ai-report`, `/ai-report-drafts` | PARTLY. Save and list are DONE (mocked). NOT built: editing a draft as a new version, wording by the model (polish), version history. |
| UC-268 Monthly strategy and quarterly roadmap draft (findings, targets with formula, milestones), shop health score with its parts; Approve or Reject sends the payloadHash that was on screen, reject needs a reason | `/ai-strategy` | DONE (mocked client). Needs `reports.financial`; deciding needs `ai.recommendation.decide`. NOT built: owner edits to a draft, the weekly insights run. |
| UC-386 Branch comparison for a product: status per branch, suggested moves with cost per unit; shows "cost not set" when the owner has not set one | `/ai-branch-compare` | PARTLY. View is DONE (mocked). NOT built: turning a move into a transfer suggestion, and the transfer-cost setting. Needs `inventory.view`. |
| UC-G14 Expansion what-if: investment, fixed cost, mature sales, ramp-up, margin (own history when empty), working capital; break-even, payback, sensitivity; save and delete | `/ai-expansion` | DONE (mocked client). The server needs JSON numbers for these what-if assumptions, so they are sent as numbers after the text is checked; results are shown, never added up in the app. |
