# OMS-R21 — Persistent station capacity and planning forecast

**New migration:** `supabase/migrations/20261014000002_production_station_capacity.sql`.
Review, back up and apply the SQL migration **before** deploying R21 Node/Svelte code. Do not run GitHub Actions.

R21 adds explicit, per-station planning assumptions independent of loading-day
capacity. The production manager (RD/Boss/HeadOfProduction) may configure
workers, hours per worker, availability percentage and ISO weekdays. All
authenticated active users may read RLS-approved profiles. Missing capacity
row means **unconfigured**; there are no synthetic defaults in the server.
Writes use an `updated_at` compare-and-set; the PostgreSQL trigger owns
`updated_by` and timestamps. The API rejects stale edits with HTTP 409.
RLS enforces permissions even if a user bypasses the UI. No DELETE grants.

The planner queries R20's canonical station workload snapshot and station
capacity profiles. It distributes explicit estimated hours into configurable
seven-, fourteen-, or twenty-eight-calendar-day windows respecting chosen
workdays and calculated effective station hours
(`workers × hours_per_worker × efficiency_percent/100`). Forecasted jobs are
sorted by R20 queue risk/priority. Blocked/rework, ON_HOLD, missing estimates,
unconfigured/zero capacity and work outside the horizon are surfaced as
**unplanned** rather than silently assigned. Upcoming NOT_STARTED stages are
excluded by default and can be toggled as **tentative** projections.

Important limits: this is a **simulation**, not a production booking service.
No user/staff identity or actual time sheets are allocated; sick days,
holidays, shift collisions and cross-station dependencies are not modeled.
`actual_hours` is deliberately not subtracted as it is not a certified
remaining-hours measurement. Clock hours estimated by the stage are not
adjusted using percent-complete logs. It never updates order_stages, dispatch,
loading dates, or inventory. Task forecasts across multiple stations can
overlap because precedence is not guaranteed. A real committed calendar
needs separate scheduling locks, attendance, time sheets and operator approval.

Acceptance:
1. Migrate on staging. Confirm an operator can read capacity but receives
   HTTP 403 on writes; manager writes and concurrent stale writes return
   409, direct Supabase writes are also RLS-restricted.
2. Configure CNC 2 workers, 8 hours, 75%, Mon–Fri. Confirm 12 h/day and
   Sunday/weekends receive no simulated work.
3. Project a 15h CNC job (spans two working days), missing estimate, blocked
   stage, ON_HOLD job and task due yesterday. Confirm projection warnings.
4. Test missing station profiles (no invented capacity), 0 workers (closed),
   upcoming toggle (tentative only), invalid/duplicate workdays, decimal hours.
5. Test EN/RU/LV strings and responsive layout; verify production overview
   and dashboard link into planner.
6. Run `npm ci`, `npm run check`,
   `npx vitest run tests/unit/oms-r21-capacity-forecast.test.ts`,
   `npx vitest run tests/unit/oms-r20-production-planning.test.ts`,
   `npm run build`, followed by actual multi-role browser acceptance.

These GitHub connector changes have not run against the live database or
Svelte compiler; deployment and E2E testing remain necessary.
