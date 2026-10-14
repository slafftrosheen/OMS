# OMS-R20 — Production planning from canonical station stages

R20 replaces the old single-current-station production overview with a read-only
snapshot derived from all RLS-visible `draft_orders` and `order_stages` entries.
The endpoint preserves `{success,stations}` and adds `workload`, `totals`,
`alerts`, and `asOf` fields; no SQL migration is required.

An **active assignment** is QUEUED, IN_PROGRESS, BLOCKED or REWORK.
NOT_STARTED is **upcoming** and not booked capacity. COMPLETED is excluded.
ON_HOLD orders are visible as paused. Distinct order and stage counts are separate.
The full board exposes attention and upcoming filters, station-level pressure labels,
and missing-estimate counts. Dashboard workstation links normalize the actual auth
`UserStation` objects (including legacy painting/packing aliases).
Known estimated hours are summed only from explicit values for active stages;
missing estimates are counted separately. No staffing capacity or completion date
is inferred. Dates are compared in Riga local calendar days. Alerts flag
blockage, rework, overdue/due-soon stages and held orders; 5+ queued is a
heuristic queue-pressure indicator, not a capacity threshold.

The server batches orders in 200-row stable-id pages and stages in groups of
50 order IDs to avoid PostgREST's typical 1,000-row implicit cap. RLS still
controls visibility and the response is private/no-store. Query errors fail
closed rather than returning a partial board; the 10,000-order safety ceiling
requires deliberate scaling work.

Staging checks: `npm run check`, `npx vitest run tests/unit/oms-r20-production-planning.test.ts`,
`npm run build`; then simulate 200+ orders, multiple simultaneous stations per
order, blocked/rework, missing hour estimates, held orders and dates around
Riga midnight. Verify operator RLS and never infer that this view is an
automatic dispatcher or a true capacity-aware scheduler.

The code was committed via GitHub; live queries/build/browser were not executed.
