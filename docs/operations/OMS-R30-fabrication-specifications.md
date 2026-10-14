# OMS-R30 — Structured manufacturing specifications in order profiles

R30 gives staff a **shared, unit-aware fabrication-specification editor**
in both New Order and the saved order workspace. It is additive to the
legacy Profile 7st configuration and **requires no SQL migration**.

## Profile editor / persisted contract

In a profile expand **Fabrication specifications** to record:
- Width, height, depth and thickness in **explicit mm** (up to three decimal
  places, strictly positive with conservative upper limits).
- Proposed fabrication method (laser, CNC routing, bending, manual, other,
  or not verified), lighting type, mounting and installation environment.
- Material/grade, finish and installation notes.

The stored location is
`order_profiles.configuration.fabricationSpec`, with `version: 1`.
It stays attached to each individual order profile, is copied when profiles
are duplicated, and is saved using the existing `oms_update_draft_form`
revision-checked RPC. The *same* UI component is mounted on new and saved
orders. The existing Profile7stVisual remains unchanged and all older
configuration fields survive. Clearing the new specification removes it
without affecting the rest of the profile.

The front end displays invalid fields immediately; save validation also runs
in `orderFields` on the server. Unknown choice values, non-number dimensions,
nonpositive/out-of-bounds measurements, strings exceeding 800 characters,
unsupported version or unexpected keys under `fabricationSpec` are refused.
Staff can save an **incomplete draft** (width without height), but the UI
warns that its rectangular area cannot be calculated.

## Technical calculations and assistant

R29 now prioritizes the new explicit millimetre dimensions for rectangular
face area. If a structured spec is present but incomplete, older values
cannot silently fill the gaps, avoiding mixed or contradictory dimensions.
Legacy `configuration.width_mm/height_mm` and
`configuration.dimensions.{width,height,unit:'mm'}` still work on
existing profiles without an R30 specification.

The order-aware OpenRouter assistant sees **bounded, server-validated**
fabrication measurements, process preferences and notes *only when staff
explicitly grant the R27 consent*. It cannot schedule, operate machinery,
purchase stock, edit quantities or bypass the existing manual Save Draft
and production approval workflow. Method and lighting options are
**proposals**, never verified technical suitability.

**Limitations:** These fields do not verify sign contours, materials,
electrical loads, physical clearances, structural supports, tolerances,
machine capacity, nesting efficiency, scrap, shop production time or cost.
These need independent engineering review and documented customer approvals.
The calculated area is a rectangular reference face, not a cutting bill.

## Staging checks

1. Run `npm ci`, `npm run check`,
   `npx vitest run tests/unit/oms-r30-fabrication-spec.test.ts`,
   `npx vitest run tests/unit/oms-r29-technical-evidence.test.ts`,
   and `npm run build`.
2. On New Order add two profiles: one with width 1200 mm, height 500 mm,
   quantity 2, and one without valid height. Save and reopen both.
3. Confirm R29 shows **1.2 m²** only for the first profile and **unknown**
   aggregate area when any profile is incomplete.
4. Test material and mounting choices and free-text notes after Save Draft,
   refresh and again after changing another profile. Legacy Profile7stVisual
   values must remain intact.
5. Try invalid width values (0, negative, text and >100000), overlong notes,
   unsupported enum and extra keys via direct API. Server must reject them.
6. Verify a saved draft in two sessions: a stale version must receive a
   conflict; a new specification must not bypass CAS.
7. Check profile duplication, preset load, clearing the spec, removal and
   save. No configuration from unrelated profiles should bleed between rows.
8. With consent off, technical GET must not call OpenRouter. With consent on,
   ask the assistant about processes; it must describe proposals and risks,
   not claim the fabrication method is approved.
9. Verify EN/RU/LV terminology, keyboard/mobile layout, read-only managers
   in locked order stages, and that existing dimensions from legacy
   profile configurations remain usable where no structured spec exists.

**Verification status:** Changes were authored through the GitHub connector.
No local build, Vitest, live Supabase/OMS session or OpenRouter request was
run. Run all staging checks before deploying to live production.
