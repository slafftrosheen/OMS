# OMS-R24 — Measured production versus plan

Scope: new read-only `/production/performance` screen and
`GET /api/production/performance?days=7|30|90`. **No new SQL migration.**
R19 completion/progress and existing stage data are the measurement source.
The R21/R22 booking migrations are not prerequisites for this endpoint,
but are still required for the separate capacity planner.

## Source semantics

- `order_stages.estimated_hours` is the stage's estimated labor.
- `order_stages.actual_hours` is an explicitly recorded labor figure. A
  missing value is **unknown**, distinct from a genuine zero-hour value.
  `completed_at` and `started_at` are clock timestamps, not labor hours.
- The atomic completion RPC may set actual hours. If no hours were supplied,
  the completed stage remains missing data unless already recorded.
- A comparable completed stage requires BOTH estimated and actual hours.
  Totals show the number of comparable stages and the sums of their estimated
  and actual hours. A separate all-recorded-actual total is available from
  the API and must not be presented as a matched comparison denominator.
- Operator `PROGRESS_UPDATE` entries have latest self-reported 0–99%
  observation and note. These are informational observations, **not**
  time sheets and never used to infer labor utilization or hours left.
- Completed records include recently finished stages from orders that have
  since moved to `ARCHIVED`, `DISPATCHED` or other statuses, subject to
  the signed-in viewer's `draft_orders` visibility.

For the selected 7-, 30- or 90-day rolling UTC window, stage completion
timestamps are compared by actual instant (including timezone offsets).
The active-work sample is current, not restricted to that date window,
and only includes `QUEUED`, `IN_PROGRESS`, `BLOCKED`, `REWORK`
stages on active/held production orders.

## Security, query limits and UX

The API requires authentication and uses the caller's Supabase client.
Stage metadata is displayed only for orders independently visible to the
caller; operator reports are queried only for those active order IDs, with
`details->>order_id` filter and `PROGRESS_UPDATE` action.
Order scanning uses stable ID pages, history uses stable order+station
pages, and each observation batch fails closed if it reaches its 800-row
query bound rather than offering misleading partial percentages.
More than 10,000 active orders or completed stages also causes a 503.

The UI includes a 7/30/90-day picker, per-station comparison, current
work ledger and recently completed stages. Empty/missing data remain
explicit; positive variance is highlighted, but not auto-reclassified as
a stalled production job. EN/RU/LV copy explains the figures.

No mutation or scheduling action is performed. A historical completion
is not itself proof that a customer deadline was achieved, and
`actual_hours` can be entered or edited by existing production roles;
R24 does not establish a tamper-proof timekeeping system.

## Staging verification (required)

1. Run `npm ci`, `npm run check`,
   `npx vitest run tests/unit/oms-r24-production-performance.test.ts`,
   and `npm run build`.
2. Complete a stage with actual hours and another without. Confirm count,
   missing coverage, and matched variance; repeat with 0 actual hours.
3. Test historic completed work on `ARCHIVED`/`DISPATCHED` orders.
4. Test latest progress observations and timestamp ordering across offsets.
   A report with a note but no percentage must not turn into 0%.
5. Insert more than 800 progress reports in an active-order chunk and
   verify an explicit error rather than truncated data. Test the order
   pagination and stage RLS with operator and manager roles.
6. Check small-screen overflow, translations and navigation.
7. Compare performance against R23 planning on actual live orders, ensuring
   percent-report and actual-hour figures are never conflated.

Code was committed through GitHub without running the live DB,
Svelte compiler, unit test runner or browser acceptance.
