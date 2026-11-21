## Web parity, phase 7: catalogue

All rows: mocked API, not run against the real backend or a phone. Copied from the web page `products.js` (io, composition and labels tabs); field rules from `modules/catalogue/src/application/import-export.ts` and `domain/catalogue.ts`. Texts are in `i18n-parts/wp7.json`.

| Feature | State | Test |
|---|---|---|
| 7.1 Download the products CSV (`GET /products/export`, `product.export`) and the import template (`GET /products/import/template`, `product.import`), handed to the share sheet; on the import history screen | DONE | `__tests__/wp7.test.tsx` |
| 7.2 Product import: pick a CSV or an .xlsx file, check it (`POST /products/import`, nothing saved), errors per row and column, then import all or nothing / valid rows only (`POST /products/import/:job/commit`), download the report | DONE | `__tests__/wp7.test.tsx` (the file picker is mocked) |
| 7.3 Edit a product's composition as "name, percentage, formulation" lines checked against the ingredient master (`GET /ingredients`, `PUT /products/:id/composition`); add an ingredient, banned with a reason only with `product.regulated` (`POST /ingredients`); on product more, composition tab | DONE | `__tests__/wp7.test.tsx` |
| 7.4 Label sheet: "code, copies" lines, codes found like the web, label data from `GET /labels`, made into a PDF and shared; on the products list. The barcode is printed as its digits, not as bars (the web draws bars) | DONE | `__tests__/wp7.test.tsx` |
