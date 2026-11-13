
## AI and intelligence, group 8: search, voice, documents, training (branch `web-gaps-3`)

Same limits: mocked API client, NOT run against the real backend, NOT run on a phone. The document picker is mocked in tests, so it was never tried with a real file. Hindi and Marathi texts were written without a native reader and need review.

| Use case | Route | Status and evidence |
| --- | --- | --- |
| UC-264 Smart product search (name, local name, brand, category, crop, shop aliases; shows why each product matched) | `/ai-search` | DONE (mocked client). Needs `product.view`. NOT built: managing aliases (`ai.governance.manage`). Tests: `__tests__/ai-g8.test.tsx`. |
| UC-265 Voice order draft: the words are parsed to customer and product lines with quantity; lines with an assumed quantity are flagged; nothing is billed | `/ai-voice` | PARTLY. The parsing (`POST /ai/voice/parse`, intent order or search, English, Hindi, Marathi) is DONE (mocked client). NOT built: reading from the microphone (no speech package in the app; the person types or uses the phone keyboard's dictation) and turning the draft lines into a bill. |
| G10 Document classification: upload a PDF, PNG or JPEG (up to 4 MB), see the suggested category and reason, choose the category, confirm to file it | `/ai-classify` | DONE (mocked client and mocked picker). Needs `ai.assistant.use` and `org.document.manage`. NOT built: camera capture, the list of earlier classifications, reject. |
| G13 Staff training: ask the shop's training notes (quoted passages with source and version), read the notes, take a quiz, see my results | `/ai-training`, `/ai-training-quiz` | DONE (mocked client). NOT built: adding or editing notes, retired notes and everyone's results (owner, `ai.governance.manage`). |
