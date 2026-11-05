# Draft production intake implementation

Spec: ../specs/2026-11-05-draft-production-intake-design.md

1. Add failing behavioral tests and public technical fixtures derived from all five real PDFs. Implement a strict production-fact schema, exact role-aware catalog resolution, conflict detection, native-form patches and local safe-apply guards. Keep base R13 consumers compatible.
2. Extend the existing authenticated intake endpoint with production extraction, real catalog resolution, selected-profile identity, saved-order/file revalidation and explicit native-PDF routing. Add boundary tests for malformed/unauthorized/provider failures and immutable output.
3. Add reviewed production controls to the intake panel and merge selected changes into the exact local profile only after rechecks; preserve explicit fields unless replacement is deliberately acknowledged. Show unresolved choices, original/current values, evidence and confidence. Translate EN/RU/LV labels.
4. Add transactional client delivery-address tables, deduplication/backfill trigger, immutable usage snapshots, RLS and authenticated lookup. Add explicit saved-address reuse beside existing delivery controls. Exercise the actual SQL in an isolated database.
5. Document operating steps, PDF configuration, evidence limitations and migration prerequisites. Run full test/check/build, inspect diff and obtain a fresh code review. Fix substantive findings, verify again, commit and safely publish main.

Review focus: image-only PDFs; multiple depths/dates and unknown years; generic 6500K/regular PSU/cable voltage without model identity; user edits during asynchronous checks; RLS history visibility and concurrent deduplication; no internal PO assignment.
