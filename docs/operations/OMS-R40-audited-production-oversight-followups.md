# OMS-R40 — Audited follow-ups for production oversight signals

**Repository:** GitHub `slafftrosheen/OMS`, committed directly to `main`.
**Runtime status:** source-only. No CI/GitHub Actions, npm build/check, Vitest,
SQL migration application, browser test, deployment, or live Supabase call.

## Goal

Carry R39's manager-only stage-age and material-skip observations into the
already-established R25 production exception review workflow. Managers should
be able to claim a real observation, assign ownership, set a due date,
document evidence and close/reopen a follow-up **without creating a second
audit table or changing manufacturing/inventory records.**

The original R25 review queue and `oms_manage_production_exception` RPC
remain the canonical write path. The new categories are:

- `STAGE_UNCHANGED`: a `QUEUED` or `IN_PROGRESS` stage of an eligible
  active, non-`ON_HOLD` order has a canonical `order_stages.updated_at`
  timestamp at least 72 elapsed hours in the past. This is **not proof of
  inactivity**: operator timeline progress notes can be newer than the
  stage-row timestamp. Follow up by checking the station timeline or asking
  the operator.
- `MATERIAL_SKIPPED`: a `COMPLETED` stage on a current production-order
  status has `consumption_skipped=true`. Managers can document that no
  stock was used, inventory was declared elsewhere, or a separate approved
  reconciliation is required. Closing a review **does not** deduct stock,
  create movement entries, or alter the source skip flag.

## SQL deployment dependency

Apply `supabase/migrations/20261016000003_production_oversight_review_kinds.sql`
to the self-hosted Supabase PostgreSQL **before deploying R40 application
code**, after the existing R25 exception migration
`20261014000004_production_exception_reviews.sql`, the R02 material-skip
column migration `20260505100100_station_material_consumption.sql` and
their prerequisites.

This SQL adds exactly two enum-like values to the existing review
`kind` CHECK constraint. It updates the existing security-definer
`oms_manage_production_exception(text,uuid,text,text,uuid,timestamptz,date,text)`
body and retains its original role gate, active profile requirement, item
identity, unique `draft_order_id,station,kind`, optimistic revision checks,
action semantics, row locks, follow-up date bounds and append-only
`production_exception_events` audit events.

**Security and source verification:** first claim and reopen are checked in
SQL under a shared lock on the current canonical `order_stages` row.
A `STAGE_UNCHANGED` claim is accepted only if the record still has the
required age and state and the order is not paused. A `MATERIAL_SKIPPED`
claim requires a saved `COMPLETED` stage whose source skip flag is still
true. A stale/false claim raises `P0001` and maps to HTTP 409; the review
is not created. An unauthorized manager role is rejected by the existing
R25 permission contract. The migration notifies PostgREST to refresh its
schema cache. No new tables, columns or automation are introduced.

## UX and evidence scope

The established `/production/exceptions` page now also loads the
manager-authorized `/api/production/board` oversight feed, in parallel
with the R25 performance, approved commitments and review history feeds.
Read-only non-manager visitors never request manager oversight evidence;
the board API independently returns `oversight:null` for them.

- Incoming R39 observations are transformed into the same deterministic
  R25 `ProductionFinding` items as blocked/rework/missed booking reviews.
- Every review continues to use a due date and documented actions.
  Managers can claim a live issue, take ownership of an OPEN review,
  update next steps, resolve with a note, or reopen a still-live issue.
- Material skip reason is presented as **original source evidence**, not an
  AI-generated statement. The UI prompts for a reconciliation decision.
- The existing review event log and actor/time history are reused.
  Resolved reviews stay in the audit trail. Review resolution is a
  management decision and does **not** claim that source observations
  have disappeared.
- The R39 manager panel deep-links to the relevant `kind`, `orderId` and
  `station` filters in the exception review page for focused follow-up.

**Bounded source limitation:** the R39 oversight snapshot deliberately
includes at most 50 observations **of each category**. The exception page
shows a prominent caveat when there are more; an existing review outside
this preview is labelled **not verified by the current preview**, never
automatically labelled as gone. When the oversight feed fails, these two
categories are *not* synthesized as empty or resolved, and their historical
review rows are temporarily withheld from the current-source assessment.
The other R25 review categories remain usable if their feeds are valid.
An operator should open the affected order's canonical stage/material records
for further detail.

The new source is read-only. No OpenRouter-generated instructions,
external API calls, stage transitions, material deductions, or order form
changes are involved.

## Manual acceptance plan

1. **Migration order:** install R25, R02 consumption columns and R40 SQL
   before starting the R40 app. Check all seven review kinds are accepted
   by the CHECK constraint and that exactly the original management RPC
   signature is visible to authenticated managers in PostgREST.
2. As RD, Boss and HeadOfProduction, open the production board; choose an
   unchanged-stage or material-skip signal and follow the **review** link.
   Confirm the exception page opens filtered to the correct order, station
   and issue type. Normal Operators must not receive these source findings.
3. Claim a valid finding with a future follow-up date and note. Verify one
   `production_exception_reviews` row and one `production_exception_events`
   entry with actor/time. Confirm no inventory or order-stage mutations.
4. Open two sessions. Update the same review from session A, then attempt
   to update it from stale session B. Verify 409 and no lost or duplicated
   review data.
5. Change a `QUEUED/IN_PROGRESS` stage within the 72-hour threshold
   **before** claiming the previously visible observation. SQL should reject
   the stale claim; the app should request reload. Setting its parent order
   to ON_HOLD must also make such a claim invalid.
6. Complete a stage with materials skipped, then claim that finding. Add
   a concrete reconciliation note and resolve. Verify resolution remains in
   the event log and stock still has not changed. Reopen only while the
   source skip flag remains true.
7. Force the oversight board API to return 503 while performance and
   existing reviews still work. The page must warn of incomplete data
   rather than claim that R39 issues vanished. A truncated preview
   must not mark unlisted reviews as resolved/no longer current.
8. Verify all seven issue filters, order-specific focus/clear control,
   mobile layout, and EN/RU/LV labels. Confirm legacy R25 blocked,
   rework, hours and missed-booking claims are unchanged.

## Verification limitations

New tests: `tests/unit/oms-r40-audited-production-oversight.test.ts`.

Only remote GitHub source-contract inspections were performed. Tests,
TypeScript/Svelte checks, Postgres migrations, PostgREST schema refresh,
real concurrency, RLS and browser behavior **were not executed**. For
staging, after migration, an operator can run:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r40-audited-production-oversight.test.ts \
  tests/unit/oms-r39-production-oversight.test.ts \
  tests/unit/oms-r25-production-exceptions.test.ts
npm run build
```

GitHub is only source storage in this project. No CI, GitHub Actions or
automatic deployment was added.
