# OMS-R23 — Approved-hour reconciliation and production drift

Builds on R20–R22, **without a new database migration**. Requires both previously
added SQL migrations to be deployed: R21 station capacity and R22 reservation
approval. R23 reads the R22 `production_reservations` table.

## What changes

`GET /api/production/commitments` loads **all approved reservations visible to the
signed-in user**, including dates outside the requested forecast horizon. It
pages in stable reservation-ID order, checks exact counts and repeated records,
and rejects incomplete, inconsistent or larger-than-10,000 snapshots.
No proposals, cancellations or other statuses count toward committed hours.
Visibility still obeys the existing reservation SELECT RLS. The snapshot is
private/no-store and read-only.

The forecast uses approved data in two independent ways:

1. Per station and calendar date, approved hours are deducted from physical
   configured capacity. Suggested work cannot occupy those hours. If historic
   or inconsistent approvals already exceed configured capacity, free hours
   are zero for that day and an overbooked-day warning is surfaced.
2. Per order and station, **all** approved hours are deducted from that stage's
   total estimate, even if the reservations occur outside the displayed horizon.
   A stage with a fully committed estimate produces no duplicate suggestions.
   Proposed reservations do **not** consume committed capacity.

R19 actual hours are an observation, **not a trustworthy remaining-work estimate**:
they are never used to reduce forecast demand. If actual hours exceed the
stage estimate, the planner flags that overrun, even without an approved booking.

## Schedule drift and controls

R23 reports: active work with past approved dates; blocked/rework or ON_HOLD
work that still has approved time; future approved reservations without an
active schedulable stage; stages not queued or in progress; booked hours
exceeding revised estimates; station-days exceeding capacity; and actual
working hours exceeding their stage estimate.

The reservation panel remains read-only until both the all-dates approved
snapshot and the visible reservation ledger have loaded completely. After a
successful proposal, approval or cancellation it reloads both, so new
suggestions do not assume now-booked hours are free. On failure the planner
disables booking changes; it does not invent an empty ledger or zero bookings.
No drift warning cancels or moves a reservation automatically.

## Limitations

Snapshots are **read-time views**, not transactional planning locks. Another
manager may approve a reservation between the snapshot and a proposed action.
Only the R22 database RPC is authoritative for approvals and protects against
capacity, stage and prerequisite conflicts. A stale snapshot is not permission
to approve.

Forecast jobs still follow R20 priority ordering; they are not a
resource-constrained cross-station dependency solver, nor do they allocate
workers, shifts, holidays, machine maintenance or material stock. Approved
past reservations remain in the ledger for history; they are deducted from
stage totals until the stage is marked complete. Stage estimates should be
updated via the existing version-checked stage editor.

The all-dates snapshot has a deliberate 10,000-approved-record limit. Larger
installations require a server-side transactional aggregate per stage/day or
a versioned booking snapshot before scaling.

## Staging acceptance

1. Apply R21/R22 migrations first, check RLS, then deploy R23.
2. Approve 3h of a 7h CNC stage on a date **outside** a 7-day forecast. The
   stage must suggest only 4h, not 7h.
3. Approve 2h on Wednesday against 8h daily capacity. New Wednesday
   suggestions must occupy at most 6h. R22 must reject a concurrent approval
   that would exceed the station's capacity.
4. Configure a station with approved 10h against 8h available (test fixture).
   Flag 2h excess and allocate nothing else on that day.
5. Block or hold a stage with future approved hours, move a due date past, and
   raise actual hours beyond estimated. Check visible review warnings; no
   silent cancellation.
6. Return 503 or a partial snapshot from the commitments API. New proposal,
   approval and cancellation actions must be disabled until reconciliation
   is successful.
7. Approve and cancel from two manager tabs, and confirm preview reload,
   stale-version rejection and maintained RLS isolation.
8. Run `npm ci`, `npm run check`,
   `npx vitest run tests/unit/oms-r23-production-reconciliation.test.ts`,
   `npx vitest run tests/unit/oms-r22-production-reservations.test.ts`,
   and `npm run build`, followed by live Postgres concurrency tests.

GitHub code was authored without live database or browser access. This document
does **not** claim that migrations, TypeScript checks or tests were executed.
