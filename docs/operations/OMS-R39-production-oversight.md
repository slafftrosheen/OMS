# OMS-R39 — Manager production oversight, stage-age watch and material skips

**GitHub:** committed directly to `main`. This batch is a read-only addition
to the existing production planner. No new database migration, order form,
OpenRouter write ability, automated notifications, CI/Actions, test runs,
build or production deployment.

## What changed

The `/production` board now provides a **manager-only oversight** section
for RD / Boss / HeadOfProduction, using the already authorized production
board API and canonical `draft_orders` + `order_stages` tables.

`src/lib/order/production-oversight.ts` computes two explicit signals:

- **STAGE_UNCHANGED**: an eligible production order's `QUEUED` or
  `IN_PROGRESS` stage has `updated_at` at least **72 elapsed hours**
  before the observation timestamp, excluding orders in `ON_HOLD`.
  This is **not an assertion of inactivity or missed production**: progress
  reports are also saved in a separate station timeline. An operator may
  have logged activity without changing the stage row. The signal means a
  manager should inspect the order and progress ledger.
- **MATERIAL_SKIPPED**: an existing `COMPLETED` stage has
  `consumption_skipped=true`. Shows the saved skip reason, if any, and
  elapsed time since recorded completion. This is a **reconciliation prompt**,
  not proof of an outstanding stock debt. It is not automatically marked
  resolved because the current database has no canonical reconciliation
  state for this event.

Each signal is tied to the real order, station, stage state, and recorded
timestamp. Sorting is deterministic. Summary counts include all visible
eligible records; only the first 50 records of each category are included in
the bounded interactive preview. The UI explicitly warns when more records
exist. Controls provide filtering, a link to the original order and a link
to the **existing** `/production/exceptions` review workflow.

That workflow already has auditable, assignable review kinds including
BLOCKED/REWORK, missing actual hours, overrun and missed bookings. R39
**does not** fake additional review kinds or insert records into its
existing SQL audit ledger. Skipped-material or unchanged-stage signals
should be inspected manually; existing exception reviews remain the
system of record for supported review types.

## Data / permissions

- The production-board handler now fetches `updated_at`,
  `completed_at`, `consumption_skipped` and the saved skip reason for
  all stage states, including `COMPLETED`. Previously it filtered out
  COMPLETED from the query.
- The established `deriveProductionPlanning` function still filters
  COMPLETED out of current workstation assignments, so workload counts,
  scheduling pressure, stage progress and operator station cards are not
  affected by the added historical rows.
- The oversight payload is constructed **only** when
  `canManageSharedInventory(locals.user.role)` is true; others receive
  `oversight:null`. The Svelte UI independently limits the section to
  the same three roles, but browser gating is not a substitute for the
  server check. Existing Supabase row-level visibility applies to the
  underlying queries.
- The endpoint remains private/no-store, paginates orders, and fetches
  stages in bounded 50-order chunks. A failed query causes a 503, not a
  misleading empty operational snapshot.
- This pass changes no lifecycle, role permission, material deduction,
  production-stage transition, or approval/confirmation RPC.
- For self-hosted installations, the stage-skip columns originate from
  `20260505100100_station_material_consumption.sql`; the R02/R36/R38
  deployment dependencies still apply. There is **no R39 SQL migration**.

## Manual staging acceptance

1. Sign in as HeadOfProduction, Boss, RD, and Operator; only the first
   three should receive real oversight signals. Inspect network replies:
   Operator's `/api/production/board` must include `oversight:null`.
2. Make a `QUEUED` test stage older than 72 hours and an
   `IN_PROGRESS` stage at the threshold. Check both appear with stage
   age. A `NOT_STARTED` stage and a `COMPLETED` stage must not be
   misclassified as unchanged.
3. Add a progress note without changing the stage row. The unchanged
   signal may remain; the explanatory wording must make clear why this
   does **not** prove nobody is working. Confirm the operator's progress
   history still shows the note.
4. Set the order to `ON_HOLD` using existing authorized controls.
   Its unchanged-stage signal disappears; the ordinary paused/workload
   reporting is unaffected.
5. Complete a stage with explicit **Skip materials** and reason.
   The saved completed-stage skip signal and reason appear for management.
   Complete another stage with normal consumption: it is not counted
   among skips. Check R38 material ledger separately.
6. Create enough test rows to exceed 50 signals in either category.
   Verify total counts remain exact, both signal types appear in preview
   and truncation is clearly stated; no silent omission is represented
   as a complete list.
7. Check live board filters can show zero workstation cards while
   management oversight remains visible. Refresh with the server
   unavailable; the UI must warn that it displays the last good
   snapshot, not assert current status.
8. Confirm station assignment, execution, rework, review and consumption
   remain unchanged. Review EN/RU/LV copy and mobile layout.

## Verification limits

Added `tests/unit/oms-r39-production-oversight.test.ts` to check stage
aging, ON_HOLD exclusions, completed skip records, bounded previews,
unchanged active-workload math, manager-only delivery and localization.

**Only source-level GitHub inspections were performed.** The tests are
authored but **not executed**, nor are builds, browser automation, live SQL,
PostgREST/RLS checks or deployment. On the authorized staging host run:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r39-production-oversight.test.ts \
  tests/unit/oms-r20-production-planning.test.ts
npm run build
```

GitHub remains source storage. No CI/Actions or deployment automation is
required or introduced.
