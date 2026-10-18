# OMS-R44 — Inventory replenishment planning and auditable supplier follow-ups

**Canonical repo:** `slafftrosheen/OMS`, committed directly to `main`.
**Execution scope:** GitHub source editing and source-contract inspection only.
No CI, GitHub Actions, npm/Vitest/TypeScript builds, SQL execution, live
warehouse transactions or deployment.

## Business intent

Provide a reliable low-stock work queue and a manager-reviewed record of
external supplier purchasing activity, without manufacturing fictional
inventory reservations, orders, prices, deliveries or stock movements.

A replenishment *request* is internal purchasing follow-up, **not** an order
submitted to a supplier. The order-status action records an external
reference that an authorized employee has already obtained from a supplier.
The CLOSE action is administrative, **not a goods receipt**.

Physical delivery and stock increases stay exclusively in R41/R42's
manager-authorized, idempotent `oms_record_manual_inventory_movement`
(`IN`) workflow. Completion or cancellation of a purchasing request
must never alter `materials.stock`, `inventory_items.stock`, station
consumption, stock movements or production stages.

## New migration — required for R44 UI

`supabase/migrations/20261018000001_inventory_replenishment_requests.sql`

Requires canonical `materials`, linked legacy inventory parity, active
`profiles` role contracts and R41/R42 prerequisites. **Apply this migration
to self-hosted Supabase before deploying R44 application code.**

The migration adds:

- `inventory_replenishment_requests`: canonical material UUID, positive
  quantity, immutable unit and stock/minimum snapshots, free-text
  supplier label, external order reference, manager actor and timestamps,
  administrative status `OPEN`, `ORDERED`, `CLOSED`, `CANCELLED`,
  and optimistic `updated_at` revision.
- One-active-request-per-material partial unique index on OPEN/ORDERED,
  preventing silent duplicate commitments from multiple browser tabs.
- `inventory_replenishment_events`: append-only action event with actor,
  previous/new state, time and human note.
- Active-manager-only RLS reads. Browser roles have SELECT only on the two
  new tables. The sole write path is the SECURITY DEFINER
  `oms_manage_inventory_replenishment` function with an independent
  active-role gate for RD/Boss/HeadOfProduction.
- The create action uses the manager-supplied UUID as its idempotency key.
  Replaying an identical create by the same actor returns the original
  request without inserting another event or buying anything.
- Updates/order/close/cancel require the saved `updated_at` revision.
  The RPC row-locks the request before comparing timestamps; stale edits
  or invalid transitions fail atomically.
- Transition to ORDERED requires a saved supplier and a new, nonblank
  **actual external supplier reference**. It locks current canonical
  material stock and, when mapped, checks linked legacy stock parity;
  known mismatches or duplicate legacy mappings block ordering pending
  R42 reconciliation. It does **not** claim a physical stock count.
- CLOSE is possible only after ORDERED and requires a reason. CANCEL is
  available from OPEN or ORDERED with a reason. Neither action creates
  a receipt, changes stock or triggers supplier communication.
- PostgREST schema reload notification.

**No new stock ledger is introduced.** Existing R41/R42 stock authority
and production consumption remain untouched.

## Planner rules and incomplete coverage

`src/lib/inventory/replenishment.ts` derives low-stock candidates from
canonical `materials`, not legacy `inventory_items`. A candidate
appears when `min_stock > 0`, `stock` is a nonnegative whole unit and
`stock <= min_stock`. An exact-minimum record is included as a threshold
signal, not misclassified as an actual shortfall.

When valid `max_stock > min_stock`, the UI displays it as a
**planning target**. Otherwise the planning target is `min_stock`.
Neither target nor a calculated top-up is submitted automatically. The
quantity field in the create dialog is deliberately blank: a manager
chooses the actual number to request.

Supplier names are displayed from existing `supplier` or `vendor`
metadata for **verification**, not treated as confirmed contracts. The
stored supplier can be edited on an OPEN request. The underlying material
`price` is not a trusted supplier quote or an enforced purchasing price.

Materials with invalid/missing stock or thresholds and those with
unconfigured minimums are counted and warned about separately instead of
silently implying the inventory is complete. All fetched source pages
have stable ID ordering, exact-count checks and a 10,000-record safety
limit; failed or inconsistent reads raise 503 instead of providing a
false empty purchasing queue.

The planner cannot infer lead times, supplier availability, delivery
dates, reserved stock, unit conversions or demand forecasts without
authoritative business records. None are invented in R44.

## HTTP and UI

- `GET/POST /api/inventory/replenishment` uses manager roles server-side,
  private no-store responses, strict input parsing and the versioned SQL RPC.
  Returns all candidates, request records and identifying material snapshots
  even for active requests whose stock is no longer below minimum.
- `GET /api/inventory/replenishment/events?requestId=UUID` is authorized
  independently and returns at most 200 recent audit events plus exact total
  and truncation marker.
- `/inventory/replenishment` is linked in the existing inventory toolbar
  only for management roles. The page waits for the authenticated role
  before requesting private data.
- Manager controls: filter/search candidates, prepare request, edit
  quantity/supplier/note while OPEN, mark externally ORDERED with a
  supplier order reference, close with explanation, cancel with explanation,
  and inspect per-request history including actor and timestamps.
- The UI retains its creation UUID across uncertain server/network
  results, enabling safe identical retries instead of creating another
  purchasing request. Other actions reuse the original revision and get
  a conflict if another manager already updated the record.
- Clear EN/RU/LV warnings distinguish canonical stock from verified
  physical stock, purchasing requests from actual supplier orders and
  administrative closure from physical receipt.
- No OpenRouter calls or assistant-origin stock writes.

## Manual staging acceptance — mandatory

1. Back up the self-hosted database. Confirm that R41 and R42, their
   predecessors, `materials.stock`, `inventory_items.material_id`,
   active `profiles.role` and the canonical movement RPC have been
   installed. Apply `20261018000001_inventory_replenishment_requests.sql`,
   refresh PostgREST and inspect RLS/GRANT behavior as an Operator and a
   manager before deploying R44 app source.
2. As Operator or StationHead, verify no replenishment data or action is
   accessible through the new HTTP API or table SELECT policy. As
   RD/Boss/HeadOfProduction, confirm the board loads.
3. Create one material with stock 3, min 5 and max 20. It should show a
   candidate with a target 20 but the request quantity input MUST be
   blank. Set a physically/business-justified quantity and optional
   supplier; submit a request. Check one request and one audit event.
4. Retry the same create request UUID with the exact payload. It must
   not create a second request or event. Use another UUID for the same
   material while the first is OPEN: partial unique index must reject
   the duplicate. Two competing browser tabs must not both succeed.
5. Attempt Mark Ordered without a saved supplier or without an actual
   external reference. Reject without changing state. Add a supplier on
   the OPEN request, record an external purchase reference and confirm
   one ORDERED audit event. Verify no supplier-facing API was invoked.
6. Set canonical/legacy stock to different counts in a staging fixture.
   Mark Ordered should fail with a reconciliation conflict. Use the R42
   physical-count workflow (not the purchasing screen), then retry
   with the latest request version. Verify no stock was changed by
   purchasing actions.
7. Complete an external ORDERED request by closing it with a reason.
   Verify status CLOSED with append-only audit history and unchanged
   stock. Separately record goods received via the R41 audited IN
   movement, and verify stock increases only in that transaction.
8. Open the same request from two management sessions and update it
   concurrently. The second session's old `updated_at` must get 409
   and require refresh. Try invalid status transitions; confirm no
   extra event or inventory mutation.
9. Add materials with no min threshold, exact minimum, invalid stock
   or a retired active request. Inspect candidate counts and warnings;
   candidates must never claim a full physical stock audit.
10. Review all EN/RU/LV strings, narrow-screen scroll, page-level role
    gating, SvelteKit base-path links and audit history >200 records
    showing an explicit truncation message.

## Verification

Source-level regression coverage added in
`tests/unit/oms-r44-inventory-replenishment.test.ts`. Tests are
**authored but NOT executed**, and this release has **not** been built
or staged.

Staging commands (run only on your authorized OMS server, not through
GitHub Actions):

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r44-inventory-replenishment.test.ts \
  tests/unit/oms-r43-inventory-ui-consolidation.test.ts \
  tests/unit/oms-r42-canonical-inventory.test.ts
npm run build
```

Future procurement integration may include supplier contacts, external
ordering, delivery quantities and supplier invoices, but each requires a
separate verified data contract and human authorization.
