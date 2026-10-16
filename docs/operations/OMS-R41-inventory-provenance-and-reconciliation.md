# OMS-R41 — Inventory provenance, auditable reconciliation and safe manual stock writes

**Source:** committed directly to GitHub `main`. No GitHub Actions or CI.
**Verification:** source review only; no build, tests, migration execution,
live database transaction or deployment was performed by this coding pass.

## Defect addressed

R40 made material skip findings assignable and auditable, but a manager could
not inspect the actual linked order inventory movements within the review.
The pre-existing `/api/inventory/movements` POST was also unsafe: it first
updated `materials.stock`, then tried to insert `inventory_movements` in a
**second request**. If inserting the record failed, stock still changed without
a reliable movement audit. The endpoint had no explicit management role check
and trusted client-supplied actor metadata. Legacy inventory item/material
routes also accepted direct stock changes with no audit record.

R41 retains the canonical station completion/consumption RPC used by
production operators, the R25/R40 exception event log, and the original
signage-profile forms. It does **not** introduce an automatic inventory
reconciliation or let an assistant adjust stock.

## 1. New required SQL migration

`supabase/migrations/20261016000004_inventory_audit_atomic_manual_movements.sql`

**Apply before R41 application code** on the existing self-hosted Supabase
instance, after the unified material/movement migrations, R02/R38 stage
consumption and R40. This migration:

- Adds optional immutable provenance columns to
  `inventory_movements`: `request_id`, `stock_before` and `stock_after`.
  Existing historic rows remain valid with NULL in these new columns.
- Provides `oms_record_manual_inventory_movement(UUID,UUID,TEXT,INTEGER,TEXT)`
  with active manager permission (`RD`, `Boss`, `HeadOfProduction`),
  a caller-generated idempotency UUID and an explicitly locked material row.
  `IN`, `OUT` and `ADJUST` values are strictly checked. `OUT` cannot
  make stock negative, `ADJUST` is an **absolute new stock count** and
  requires a reason, and all recorded changes create a movement in the same
  PostgreSQL transaction. The actor is `auth.uid()`, never a browser string.
- When an identical `request_id` is retried by the same actor with matching
  material, kind, quantity and justification, returns the original movement
  with `idempotent:true` without changing stock twice. Reusing a key for a
  different operation fails with conflict. **A new request ID is a distinct
  operation**: users must check history if a network reply was lost before
  independently submitting a second adjustment.
- Denies direct authenticated INSERT/UPDATE/DELETE of
  `inventory_movements`. Its old anonymous-readable SELECT policy is also
  replaced with active-staff-only read access; the operator's session
  and the original RLS check remain required. The legacy
  `consume_materials_for_order(UUID,TEXT,JSONB,UUID)`, which accepts a
  caller-supplied actor, is revoked from direct authenticated use; only its
  owner/service role or the established SECURITY DEFINER production RPC can
  execute it.
- Adds trigger safeguards on `materials.stock` and
  `inventory_items.stock` to reject changes and nonzero creation made
  directly with the ordinary PostgREST `authenticated` or `anon` role.
  Approved definer-role stock transactions are unaffected. This prevents
  bypass through direct browser calls even if older broad RLS UPDATE
  policies remain in the database.
- Requests a PostgREST schema cache refresh. This migration changes the
  manual stock write contract and **must be applied before the new API
  endpoint is released**.

The existing `inventory_items` and `materials` stock columns originate
from different migration generations; operators must still check any
historic discrepancies between them. R41 **does not retroactively reconcile
those stocks**, invent movement rows for historic changes, or assert they are
already one synchronized source.

## 2. Manual inventory UI/API

The existing `/api/inventory/movements` POST now requires a logged-in
manager and uses only the atomic SQL RPC. It accepts `materialId`,
`kind`, integer `qty`, a free-text `note` and a generated `requestId`.
It rejects client-supplied `refPO` so a manual stock edit cannot falsely
appear to be a completed stage's order consumption. The existing client store
generates a UUID per requested operation and no longer supplies a spoofable
`by` field. The actor in responses comes from the database.

The authenticated GET remains a read-only audit list and uses bounded paging,
strict kind filters and explicit separate material lookups, avoiding
ambiguous historical foreign key names. Unauthorized users cannot fetch it.

Legacy material/item metadata CRUD now requires manager permissions where
missing and creates materials with zero opening stock. Metadata forms that
submit a `stock` value matching the **current** saved stock can still save
their ordinary fields, but the endpoint strips stock from the update.
A changed stock value is rejected rather than silently written without
an audit record. Opening inventory and later stock adjustments must be
recorded separately via the authenticated movement flow.

## 3. Original evidence in the existing review

`GET /api/production/exception-evidence?reviewId={uuid}` is manager-only,
non-mutating and `private, no-store`. It uses the existing R25/R40 review ID
and RLS-protected order/stage rows to retrieve:

- The original saved stage state, current revision, completion timestamps,
  source skip flag and skip reason.
- The latest 100 **order-linked** inventory movements (exact total,
  explicit truncation marker, actor, time, quantities and original
  movement IDs); manual stock records with `reference_type=manual` are not
  presented as automatic order consumption.
- `stock_before/stock_after` for movement records created by R41's manual
  RPC, which are NULL for historical stage movements.

**Critical attribution limitation:** `reference_id` identifies the
**order**, not a specific `order_stages.station`. Historical movement
notes can mention a station, but custom notes frequently do not.
The UI explicitly states that these are order-scoped audit records and
does not assign them to a workstation without verified lineage.

R25/R40 review pages now include a manager-only **Original evidence**
panel. Managers can select up to ten existing movement UUID references
when updating or resolving a review. The existing review POST validates
each selected movement against the review's actual `draft_order_id`,
then appends those UUIDs to its bounded human-written note. The established
`oms_manage_production_exception` RPC stores that note and its append-only
action event. **This is a traceable reference to real movement IDs, not an
automatic judgment that those movements prove reconciliation.** The manager
still supplies the conclusion and remains responsible for separate stock
corrections if required.

## Manual acceptance checklist

1. On staging, install R36, R38, R40 and **R41 in order**. Verify both
   legacy/manual stock paths, the manual RPC signature, movement provenance
   columns and triggers exist; reload PostgREST schema.
2. Verify **Operator** and other non-manager accounts cannot POST manual
   movements, change `stock` via direct PostgREST, or read manager exception
   evidence. Boss/RD/HoP can edit material metadata normally, but cannot
   change stock through direct material/item PUT.
3. Create an item with zero stock and record `IN 10`, then `OUT 3`.
   Confirm final `stock=7` and exactly two audit rows with correct
   `performed_by`, before/after values and caller request IDs.
4. Retry the **same** movement request UUID with identical input:
   ensure `idempotent:true`, no second ledger row and no second stock
   deduction. Reuse the UUID with different quantity/note/actor: fail.
5. Attempt `OUT 999` and invalid/missing adjustment reasons. Ensure
   transaction failure preserves stock **and** creates no movement.
6. Simulate a failure between network request and response. On refresh,
   verify movement ID and material stock rather than submitting a new
   request ID blindly. Check repeated button clicks during waiting.
7. Complete a real production stage through the R38 consumption RPC.
   Verify stock deduction still succeeds as authorized, with the canonical
   order movement. Direct execution of the legacy actor-forged RPC should
   be forbidden to an authenticated browser.
8. Open the R40 review queue as a manager; open **Original evidence** on a
   material skip, confirm saved skip reason, audit times, and the original
   order-linked movements. Missing movement history must not imply zero
   materials consumed. Open a record with more than 100 movements: confirm
   truncation.
9. Select a linked movement ID and save review follow-up/resolution.
   Confirm the matching movement UUID appears in the existing review event
   history. Attempt to send a UUID belonging to another order; expect 409
   and no review mutation.
10. Test source errors, Svelte UI controls, EN/RU/LV localization and
    narrow-screen behavior. Verify regular order, stage, gallery, Canvas and
    OpenRouter flows are unchanged.

## Build/tests not run

Added `tests/unit/oms-r41-inventory-evidence.test.ts` for source contract
regressions. An operator should execute on staging after installing the
migration:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r41-inventory-evidence.test.ts \
  tests/unit/oms-r40-audited-production-oversight.test.ts \
  tests/unit/oms-r38-production-execution.test.ts
npm run build
```

No automatic CI/Actions or deployments were created. Source-level review
alone cannot validate PostgreSQL trigger semantics, permissions or live
stock totals; stage operator acceptance must precede deployment.
