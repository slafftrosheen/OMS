# Workshop material definitions

`workshop-aluminium-2026-10-31.json` records the owner's requested **1500 × 3000 mm aluminium sheet** format and **0.5, 1, 1.5, 2, 3, 5, 8, 10 and 15 mm** thickness choices. It is a generic order-profile material family. It does not identify a supplier, brand, alloy or finish, and does not assert that any thickness is currently in stock.

The additive migration `../migrations/20261031000002_workshop_aluminium_sheets.sql` creates `WORKSHOP_ALU_SHEET_1500X3000` in `ALU_SHEET`, with those exact thickness options. It also inserts missing options into the legacy `ALUMINUM` thickness family. Existing choices, including inactive ones and nonstandard thicknesses, are preserved. Existing materials, units, stock, prices, saved orders and custom metadata are not changed. A code or SKU already used by an unrelated record aborts the transaction for reconciliation.

Reapplying the migration leaves the sheet record unchanged, including any later workshop edits, and does not duplicate existing thickness options. New material stock is initialized through the canonical table default of zero; it is not a stock receipt. The migration is checked against the repository's canonical schema in an isolated PostgreSQL engine. It still needs the normal target-schema review and manual migration process before it is available in a live database.

Native draft-profile pickers classify candidates by recorded product form, with narrow fallbacks for legacy flat-bar/tube names. Sheet materials, including GS and XT acrylic, belong in face/back choices; aluminium sheets belong in sides; flatstock and profiles belong in frame. The main-cable picker uses recorded power/multicore purpose and excludes identifiable internal, signal and control wiring. This is catalog organization, not electrical or structural suitability approval. Loading a catalog does not alter a saved legacy selection.

Run the focused checks from the repository root:

```sh
node packages/vitest/bin.js tests/unit/profile-material-roles.test.ts tests/unit/workshop-sheet-catalog.test.ts
OMS_CATALOG_PGLITE_MODULE=/tmp/oms-catalog-qa/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/catalog/verify-workshop-sheet-seed.mjs
```

The integration verifier uses an isolated in-memory database and never contacts Supabase or reads its credentials. Install PGlite outside the repository as described in the sourced catalog README if it is not already available.
