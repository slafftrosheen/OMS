# OMS-R25 — Production exception ownership and audit

R25 turns R23/R24's existing production evidence into a manager-facing
**review queue**, while keeping the operational data authoritative.

**New database migration:** `supabase/migrations/20261014000004_production_exception_reviews.sql`.
It must be deployed **after** the R21 station capacity and R22 reservation
ledger migrations, before the updated application. R23/R24 add no schema.

## Detection rules

The read-only page at `/production/exceptions` loads:
- R24 performance report (90 days of completed stage history and all current
  active assignments); and
- R23 approved reservations (all dates); and
- the new R25 review ledger (including past resolved records).

The detector surfaces five conditions:
1. `MISSING_ACTUAL`: a recently completed stage has no recorded actual hours;
   a true zero is valid and is **not** missing.
2. `ACTUAL_OVERRUN`: both actual and estimated hours exist and actual exceeds
   the estimate (completed or currently active stage).
3. `BLOCKED`: an active stage remains blocked.
4. `REWORK`: an active stage remains in rework.
5. `MISSED_BOOKING`: at least one APPROVED booking is in the past while its
   stage remains active. Booking hours are **not** worked hours and do not
   establish completion.

The UI deduplicates findings by order, station and type, retaining totals and
latest missed booking day for past bookings. A resolved review may still have
a live finding; resolution indicates a manager's judgment, **not** that the
production state was automatically repaired. Historical reviews remain visible
when their current source condition disappears. Any failed source request
is explicitly reported. If approved reservations cannot load, missed-booking
findings and historical missed-booking judgments are deliberately withheld
rather than declared absent.

## Manager workflow

The table `production_exception_reviews` stores one review per
order/station/exception type. The append-only
`production_exception_events` table stores who performed every action,
including previous and next status and the note.

- **Claim:** A manager takes personal ownership with a required follow-up
  due date. The PostgreSQL function rechecks the live stage/booking condition
  before accepting the claim.
- **Update:** Manager records follow-up notes and a due date.
- **Resolve:** Manager records a non-empty rationale. This changes review
  status only; it does not complete stages, edit actual hours or change the
  schedule.
- **Reopen:** Available only when the exception is still present, leaving
  the review open for reassignment.
- **Take:** Another manager takes an open review with a due date.

Only active RD, Boss and HeadOfProduction users can mutate reviews. The
client's role check is presentation-only; the API and SQL SECURITY DEFINER
RPC verify the manager role independently. Table writes are not granted.
RLS protects review and audit reads with authenticated and visible-order
checks. A full `updated_at` compare-and-set protects against stale actions,
and changes append the audit event in the same PostgreSQL transaction.

A review records a decision, not a timekeeping edit, inventory consumption
or job movement. Owners are recorded by UUID; the interface identifies
whether an assignment belongs to the current user. The audit panel displays
the timestamp, transition and actor ID prefix.

## Explicit limitations

The review key is scoped to one order/station/type; separate repeated
episodes of the same issue share a record and use reopen/history for
accountability. This MVP does not send reminders or dispatch staff
automatically. The 90-day lookback for completed stages is a UI policy,
not a retention limit on review records. The performance endpoint's RLS
and bounded log reads remain in effect. Rework details are observations;
the dedicated R02 atomic rework workflow remains authoritative.

## Staging acceptance (required)

1. Back up Supabase; apply R21, R22, then R25 migration and check
   signatures, RLS and grants. Do not use GitHub Actions.
2. Create a completed stage with no actual hours, another with 0 actual
   hours, and one with actual hours greater than estimate.
3. Block a stage, create a rework stage, approve a date in the past for an
   active stage; confirm five types and no false positive for 0 hours.
4. Verify an operator can read permitted reviews but cannot mutate the
   table or invoke the management RPC. Inactive managers must also fail.
5. Claim from two manager sessions concurrently; only one review is
   created. Take/update/resolve/reopen, with stale version and missing
   follow-up date, must fail correctly with 409 or 400/403 as appropriate.
6. Resolve while the issue remains; verify the review is still RESOLVED.
   Reopen when source still exists. If source disappears, no new claim
   or reopen should be allowed; historical review remains readable.
7. Confirm each accepted action creates exactly one audit event, no
   stage/inventory change, and all EN/RU/LV strings render.
8. Disconnect approved bookings and the review ledger separately.
   Missing data must never appear as a cleared queue; actions disabled
   if review ledger is unavailable.
9. Run `npm ci`, `npm run check`,
   `npx vitest run tests/unit/oms-r25-production-exceptions.test.ts`,
   `npx vitest run tests/unit/oms-r24-production-performance.test.ts`
   and `npm run build`. Finally run multi-user SQL concurrency and
   desktop/mobile browser tests.

**Verification status:** Source-level checks and GitHub commits only.
The migrations, compiler, tests and real Supabase concurrency have **not**
been executed in this session.
