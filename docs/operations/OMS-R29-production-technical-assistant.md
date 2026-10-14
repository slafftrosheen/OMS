# OMS-R29 — Practical production helpers in the OpenRouter order assistant

R29 deepens the saved-order assistant with **deterministic production evidence**,
separate from model-generated advice. This batch needs **no new migration**.

## Staff workflow

1. Open a saved order → Order Assistant in the workspace.
2. Use the saved-order guide's **Technical checks** shortcut if needed, then
   press **Check saved facts** in Order Assistant. The app makes a read-only GET
   request to the authenticated OMS server; **no data is transmitted to OpenRouter**.
3. Review the technical panel: primary quantity (only if every profile count
   is explicitly valid), material requirements, the number of profiles with
   explicit rectangular dimensions, and any missing/unit-mismatch signals.
4. Optionally press **Ask about these findings**, check OpenRouter consent,
   and send the prefilled question. The selected OpenRouter model receives
   the deterministic evidence with the saved order as **untrusted data**.
5. Follow up on missing dimensions, material specification, fabrication steps
   or other real uncertainties. All advice remains optional. R27 draft field
   suggestions still require individual selection and a normal Save Draft.

## Canonical inputs and hard safety boundaries

The checks use the authenticated actor's RLS-filtered `draft_orders`,
`order_profiles`, active `profile_templates`, `order_materials` and
`order_files` count, with explicit non-truncation limits and permissions
aligned to the R27 order-assistant endpoint.

- Primary quantity is `order_profiles.quantity1`. Missing, zero or invalid
  profile quantities make the aggregate unknown; quantities 2–4 are not
  assumed additive because their meaning is profile-dependent.
- Rectangular face area requires **both** explicit
  `configuration.width_mm` and `configuration.height_mm`, or
  `configuration.dimensions.{width,height,unit:'mm'}`. Free text,
  2D Canvas pixel sizes, profile labels, implicit centimetres or
  `BENDER.depth` are **not** converted into usable dimensions.
- Per-profile bounding area = width(mm) × height(mm) × primary quantity / 1e6.
  This estimates **rectangular bounding face area in m²**, not exact cut
  contour, sheet consumption, nesting efficiency, waste, tooling requirements,
  labor, pricing or feasible stock.
- The panel never claims that a material requirement is inventory on hand.
  `order_materials` quantities and units are shown as recorded; zero/negative
  values, missing units and equal material names with differing units are
  highlighted. Quantities in unlike units are never added together.
- Missing linked files are explicitly flagged. Linked files are counted,
  **not read or visually verified**. Real PDF/image
  content remains a separate AI Intake capability.
- The output always states `inventoryVerified=false`,
  `fileContentsVerified=false`, `feasibilityVerified=false` and
  `materialYieldEstimated=false`. Production-readiness and inventory
  comparison remain the independent R14 function, never superseded by chat.

For R27 chat/field-proposal calls, deterministic derived technical facts are
included in the bounded OpenRouter context. Raw profile configuration JSON
is not sent; the server computes surface evidence first. The model is
instructed not to fill missing dimensions or imply machine suitability.

## Operator safety and privacy

Only authorized editors can run saved-order technical checks. The new
`GET /api/orders/[id]/technical-checks` requires an authenticated caller,
checks owner/manager role and uses the caller's Supabase client, not a
service-role bypass. Queries are bounded and fail if any linked table or
profile template query fails. GET is non-mutating, makes no external request,
and has `Cache-Control: private, no-store`.

The local checker requires **no OpenRouter consent**, but switching to the
model answer still requires R27's opt-in sharing consent. A returned
`orderUpdatedAt` anchors the local technical summary to the saved version;
new order changes clear the cached summary. No AI suggestion changes
material quantities, dimensions or production stages.

## Staging acceptance

1. Run `npm run check`,
   `npx vitest run tests/unit/oms-r29-technical-evidence.test.ts`,
   and `npm run build`.
2. Check a profile with `width_mm=1200`, `height_mm=500`, quantity 2:
   result should be 1.2 m² of *bounding rectangle*, never stock consumed.
3. Check a second profile with dimensions missing or `unit='cm'`; the
   aggregate area becomes **unknown**. Do not silently infer conversions.
4. Create one order with identical material names in `m` and `cm`; the
   checker should flag the discrepancy without summing them.
5. Confirm a new or draft order with no material entries and 0 files reports
   missing/unverified evidence. With an inaccessible file count, GET must
   return an error, not a false zero.
6. Confirm no browser request reaches OpenRouter when using only
   **Check saved facts**. Selecting **Ask** must only prefill a question;
   consent and Send remain separate.
7. Test EN/RU/LV, an operator without edit permission, a manager, and a
   foreign order. The GET endpoint must never bypass RLS.
8. Test edits to a saved order while technical checks are cached. Stale
   technical evidence must clear or be reloaded.
9. Recheck R13 field proposals, R14 production readiness, R27 order chat,
   Save Draft CAS, materials, and files with existing regression suites.

This GitHub-only batch has not been compiled, run against the staging
database, verified with a live OpenRouter model or tested in a browser.
