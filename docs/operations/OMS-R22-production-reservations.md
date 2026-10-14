# OMS-R22 — Production scheduling proposals and approvals

**Requires both database migrations in order:**
1. `20261014000002_production_station_capacity.sql` (R21)
2. `20261014000003_production_reservation_approvals.sql` (R22)

Apply only after backing up staging; deploy Node code afterward. No GitHub Actions.

## Scope and approval contract

`/production/planner` now presents read-only forecast suggestions alongside a separately
persisted **reservation ledger**. Managers (RD, Boss, HeadOfProduction) can propose
a station/order/day hours slice, approve it or cancel it. Operators can read
RLS-visible reservations but cannot mutate them.

All mutations call the security-definer `oms_manage_production_reservation` RPC.
The `production_reservations` table is SELECT-only for authenticated clients;
RLS checks active account and accessible order. No direct write grants exist.

The database holds a row lock on the configured station capacity row during
approval and cancellation. Two simultaneous approvals at the same station
cannot each see an outdated free-hour total. The database checks:

- Gregorian working date is not in the past (Europe/Riga), and the configured
  station has personnel and the requested date is an allowed working day.
- The current order is CONFIRMED or IN_PRODUCTION (or READY_TO_LOAD
  specifically for DELIVERY/LOGISTICS), and the stage remains open.
  NOT_STARTED can be proposed but cannot be approved.
- On approval the stage is QUEUED or IN_PROGRESS, its approved total may not
  exceed its estimated hours, and upstream standard workflow stages must all
  be COMPLETED (CAD → CNC → EDGE → ASSEMBLY → PAINT → PACKAGING → DELIVERY).
  Legacy extra stations can be approved directly when their stage is ready;
  there is no invented dependency chain for them.
- The total station-day APPROVED hours plus this proposal must not exceed
  `workers × hours_per_worker × efficiency_percent/100`.
- The reservation carries a revision token, checked after locking before
  approve/cancel. Proposals duplicate per order/station/day are rejected.
- Later capacity reductions cannot invalidate existing approved future
  reservations. Stage completion cancels future active reservations.

Read requests must specify a valid date range no wider than 91 calendar
days and paginate in stable 100-row pages. A CANCELLED record stays in the audit ledger. There is no automatic
transition of an order stage and no inventory or loading-day mutation.

## Important limitations

**Forecast suggestions do not subtract already approved reservations.**
The ledger exposes committed hours so users can compare, and the atomic
approval prevents an overbooking even if someone proposes an overlapping
slice. This is an operational MVP, not yet a recalculated constrained
planning engine. Approval records *station hours*, not named workers, shift
attendance, material reservations, customer promises or CNC machine identity.
Mixed-station forecast suggestions can still overlap. Managers must make an
explicit approval decision after prerequisites finish.

Race handling: work across the API's paging range is read-only. Proposals
and approvals use transactional SQL. Concurrent stage completion or capacity
modification can cause a PostgreSQL retryable serialization/deadlock failure;
the API reports a failed transaction rather than claiming success. Check
the ledger before retrying a timed-out approval.

## Staging acceptance

1. Apply R21 then R22 migration; verify both tables, RLS policies and RPC grants.
   Ensure non-manager cannot INSERT/UPDATE directly or call RPC successfully.
2. Configure CNC 1 worker × 8h × 100%, Mon–Fri; propose three 4h jobs for
   the same day. Approve two; third must fail with 409.
3. Submit simultaneous approvals from two separate manager sessions and
   confirm only capacity-feasible rows commit. Retry same version = 409.
4. Test future standard workflow stage proposal while predecessor is still
   incomplete: proposal allowed, approval rejected until completed/queued.
5. Stage completion and capacity reduction must prevent or release incompatible
   future approvals. Cancellation must release capacity and remain auditable.
6. Verify duplicate proposed stage-day, insufficient estimated_hours,
   no capacity config, zero workers, blocked stage, ON_HOLD order, past date,
   inactive user and malformed hours all fail.
7. Test 100+ ledger rows, pagination, EN/RU/LV UI, phone layout and refresh
   after a network failure.
8. Run `npm ci`, `npm run check`,
   `npx vitest run tests/unit/oms-r22-production-reservations.test.ts`,
   `npm run build`; then real Supabase concurrency tests.

Code was written through the GitHub connector; the live schema, Svelte
compiler, transactional concurrency and role matrix have not been exercised.
