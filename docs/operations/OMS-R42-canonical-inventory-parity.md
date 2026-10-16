# OMS-R42 — Canonical inventory stock, legacy mirrors, physical-count reconciliation

**Source status:** committed directly to `slafftrosheen/OMS` `main`.
No CI, GitHub Actions, npm build/check, tests, live Supabase transaction,
SQL migration application or deployment performed in this coding batch.

## Root cause and authority

The operator's **Complete stage → Declare materials** selector loads stock
from canonical `public.materials` through `/api/inventory/items`, while
the original R02 seven-argument `complete_stage_with_consumption` was still
checking stock and deducting units from the **deprecated**
`public.inventory_items` table.

This caused two distinct failure risks:

1. New canonical material IDs do not necessarily exist in
   `inventory_items`, so the operator could see available material that
   stage completion would reject.
2. Historic materials and inventory_items records can have different
   `stock` values. Completion could deduct from the legacy value while
   manual inventory adjustments changed only the canonical value.
   A successful work-order completion did not necessarily change the
   inventory balance visible on the stock catalog.

**R42 design decision:** `materials.stock` is the sole canonical on-hand
quantity. A legacy `inventory_items` row linked by `material_id` is a
compatibility **mirror**, never the authority. The migration intentionally
does **not** copy historical values to make them agree: doing so would
fabricate a physical inventory decision.

## Required SQL migration

`supabase/migrations/20261016000005_canonical_inventory_consumption.sql`

Apply on staging **after R02, R38, R41**, with R36/R40 and their prerequisites
applied for the wider OMS app. This migration is **required before deploying
R42 source**. It:

- Redefines the internal, seven-argument
  `complete_stage_with_consumption` used by the existing R38
  **revision-checked eight-argument** completion RPC. It keeps the existing
  order lock, stage state/lifecycle, material declaration, skip reason,
  actual hours, duplicate material/quantity validation, stage transition and
  next-station queueing. No direct execution is granted to browser roles.
- Resolves each supplied `item_id` as a canonical `materials.id`, or
  accepts a deprecated `inventory_items.id` **only** as an alias for
  that same material. The two IDs cannot be used to declare the same
  canonical material twice in a single stage.
- Locks the canonical material row before any associated legacy item row.
  If a linked legacy row exists, its previous `stock` must match the
  canonical stock. Duplicate legacy mappings or mismatched balances
  cause the transaction to abort **before stock deduction, movement
  insertion, or stage completion**.
- Redefines the internal `consume_materials_for_order` to deduct from
  `materials`, update the single linked `inventory_items` mirror to the
  same final count (when present), and append one order-linked
  `inventory_movements` row containing both IDs and before/after
  provenance. The helper retains low-stock warnings and counts the number
  of material *lines*. Canonical-only new materials work without creating
  fabricated legacy items.
- Updates the R41 manager-authorized atomic manual movement RPC. Normal
  `IN`/`OUT` requires linked stock parity and mirrors any valid update
  atomically. A manager's explicit `ADJUST` can reconcile a mismatched
  linked row, including when the physical count happens to equal the
  canonical balance. The actual previous legacy balance is saved as
  `legacy_stock_before` in the audited movement record.
- Provides `oms_reconcile_inventory_stock`, which requires the manager's
  **physical count**, justification and both expected stock balances. It
  locks the material and linked legacy row, checks the expected values and
  delegates the adjustment to R41's idempotent audited movement RPC.
  Concurrent changes cause a conflict. A retry using the same request UUID
  returns the existing audited result instead of moving stock twice.
- Replaces the existing consumption summary view with a compatible column
  contract but uses a strict `station=NAME` note prefix. Older custom notes
  that cannot reliably identify a station remain `unknown`, not falsely
  assigned to one. Canonical-only movement records can be reported by
  material SKU/name even when `item_id` is NULL.
- Keeps unversioned completion and caller-controlled stock deduction RPCs
  revoked from authenticated use. It refreshes PostgREST's schema cache.

**Do not automatically repair divergent/missing mappings.** If an old
item is not linked to any material or several items map to one material,
a manager must establish the correct identity and physical stock through
a separately reviewed data repair. The page will not guess it.

## Management diagnostic and explicit reconciliation

`GET /api/inventory/consistency?page=N` is manager-only, paginated at
50 canonical records, and returns observed canonical/legacy balances,
matching/different/ambiguous/invalid state and count of old rows without
canonical mapping. The server rejects incomplete linked legacy queries,
rather than misreporting an unknown value as a match. The counts are
**per page**; do not mistake them for a whole-database reconciliation total.

New `/inventory/consistency` page, linked from the existing inventory area,
shows these results in EN/RU/LV. For a unique linked **DIVERGENT** pair,
a manager can enter a physically observed count and a meaningful reason.
The browser sends the two saved expected counts and a stable request UUID
to `POST /api/inventory/consistency`. The SQL transaction decides whether
those balances are still current. No candidate value is prefilled; neither
database's stored stock is presumed true.

The UI surfaces the actual audited movement UUID on success. If a network
reply is uncertain, the same unchanged request/UUID should be retried and
the movement history checked before any new correction.

## Operator-facing behavior

- The existing stage-completion modal keeps using canonical material IDs.
  No duplicate manufacturing fields or order profile forms are added.
- A verified canonical shortage displays a stock-replenishment instruction.
  A mismatched/unmapped legacy stock path displays a **management
  reconciliation needed** instruction. Both reject the stage completion
  without consuming units.
- The stage-completion revision validator contained double-escaped
  backslashes in its regular expression. R42 corrects it so actual
  offset-aware PostgreSQL timestamps can be accepted by R38's optimistic
  concurrency flow.
- Order-specific material references continue to come exclusively from the
  audited stage-completion RPC. No OpenRouter model or AI suggestion
  writes inventory balances.

## Manual staging acceptance — mandatory before deployment

1. Back up the self-hosted database. Confirm actual installed migration
   state and active table columns, roles, index constraints and security
   definer owners before applying R42. Apply previous pending R36/R38/R40/
   R41 migrations first. Install R42 SQL, refresh PostgREST.
2. Create a **canonical-only** material with stock 10, open a real
   `IN_PROGRESS` production stage and declare 2 units. Completion must
   consume canonical stock to 8 and append one order movement with
   `material_id` set and optional legacy `item_id=NULL`. No phantom legacy
   row should be created.
3. For a material linked to one legacy item with matching counts 10/10,
   perform manual IN +4, OUT -1 and a real stage deduction -3. After each
   step both tables must agree, and every deduction must have one movement
   record with correct original IDs and order/manual reference.
4. Construct a 10/7 divergent test pair. The station's attempted completion
   must fail, leave both quantities unchanged, insert no movement and not
   advance the stage. A normal manual IN/OUT must fail similarly. The
   management diagnostic must flag the mismatch.
5. Have a manager physically count the item and enter **9** with a concrete
   explanation. Confirm both saved values become 9 and one manual audit
   entry includes canonical 10, old legacy 7 and new stock 9. Also test
   physical count **10** (same as canonical) when the mirror differs; it
   must still create a traceable reconciliation event.
6. Race two sessions: refresh a material with 10/7 in session B, then change
   it in session A. Submitting B's stale expected balances must fail
   atomically with 409. Replaying the same successful request UUID must
   not create another movement.
7. Try a legacy item ID alias and canonical material ID in the same stage
   declaration. The RPC must reject this as a duplicate canonical material.
   Try an item with `material_id=NULL` and a duplicated mapping; both
   should require explicit manager intervention, never guess an ID.
8. Verify valid stage revision timestamps now pass validation and a stale
   stage revision still fails. An unresolved `REWORK` remains blocked
   by R38. Preserve explicit material Skip behavior.
9. Confirm the manager-only diagnostic cannot be read or updated by an
   Operator; verify `materials` and `inventory_items` direct stock writes
   are still rejected via R41 trigger protections.
10. Compare historic order consumption rows in the revised view. Canonical
    movement rows should show correct name/SKU. Legacy notes with
    ambiguous station names must report `unknown`; do not rewrite
    historical values on guessed attribution. Verify all EN/RU/LV displays.

## Scope and limitations

This pass does not implement material reservations or infer untracked
reserved balances: repository search did not reveal a canonical reservation
ledger. It also does **not** migrate/remove the legacy table, rebuild
historic on-hand balances, resolve broken links automatically, or fix
already-recorded stock without a physical-count decision.

Regression source tests:
`tests/unit/oms-r42-canonical-inventory.test.ts`.

**Not run:** TypeScript/Svelte check, Vitest, SQL migration, browser testing,
real RLS, trigger behavior, concurrent transactions, builds or deployment.
Operator staging commands, only after applying required SQL:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r42-canonical-inventory.test.ts \
  tests/unit/oms-r41-inventory-evidence.test.ts \
  tests/unit/oms-r38-production-execution.test.ts
npm run build
```

GitHub is a source repository only. No CI/Actions, hosted automation or
deployment scripts were added.
