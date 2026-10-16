# OMS-R38 — Version-bound station completion, material receipts and real handoff

**Code status:** committed directly to GitHub `main`, source only. No CI,
GitHub Actions, builds, Vitest, live Supabase RPC calls or deployment.

## Root cause

Previously the stage-completion endpoint accepted the currently selected
material lines and skip mode, but did **not** pass an optimistic-lock revision.
The R02 database completion RPC locked the order and stage and checked state,
but allowed completion directly from `REWORK` and could return
`next_station` even when that next stage was already queued, blocked or
completed. The API then announced it as a new handoff. A workstation could
also submit a stale completion dialog opened before another staff member
changed the stage.

The inventory RPC returns `consumed` as the **number of material line
items**, NOT their summed quantities. Operator messages must not describe
this number as stock units.

## New SQL migration — apply before R38 application deployment

`supabase/migrations/20261016000002_versioned_stage_completion_handoff.sql`

Preconditions:
- R02 `20261009000001_complete_stage_with_consumption.sql` installed, which
  performs atomic stock deduction, movement logging, stage completion, and
  conditional next-stage queueing.
- R02 `20261009000003_atomic_rework.sql` installed for rework resolution.
- R36 confirmation migration installed before the R36/R37 code.

A new **eight-parameter**
`complete_stage_with_consumption(...,p_expected_updated_at TIMESTAMPTZ)`
RPC keeps the existing R02 seven-parameter implementation internally.
Under the same transaction it:

1. Checks logged-in, active user, role and station assignment before
   touching sensitive order/stage rows.
2. Locks the order, then the selected station stage. The stage must still
   be `IN_PROGRESS`, under an eligible production order status, and its
   `updated_at` must exactly match the workstation snapshot.
3. Rejects any unresolved `rework_cycles` for that same station. Rework must
   be resolved via the existing audited rework endpoint; it cannot be
   shortcut by declaring materials.
4. Locks the next standard station's stage (when present) and remembers its
   previous state. Then it invokes the unchanged R02 seven-parameter
   atomic material-consumption logic.
5. Reports `handoff_queued:true` **only if** the next stage changed
   from `NOT_STARTED` to `QUEUED`. An already active, blocked, reworked or
   completed station does not receive a spurious new handoff.
6. Revokes direct authenticated execution of the old seven-parameter
   entrypoint; the owner-owned internal implementation remains available to
   the new SECURITY DEFINER overload. It sends a PostgREST schema-cache reload
   notification.

The migration does not alter manufacturing field schemas, station transition
permissions, inventory formulas, order template configuration, or approval
policy. The new application depends on the eight-argument overload and must
not be deployed before this SQL is applied.

## Workstation and API

`POST /api/orders/{id}/stages/{station}/complete` requires a valid
`expectedUpdatedAt` (missing/invalid: HTTP 428). The frontend supplies the
selected station row's actual `updated_at` and still requires an explicit
operator material declaration or a reasoned Skip. The RPC rejects stale
or REWORK/BLOCKED state before any stock deduction.

The server posts next-station chat only for `handoff_queued:true` and
returns a `handoffQueued`/nullable `nextStation` receipt. Material counts
shown after confirmation refer to recorded material **lines**. When a
committed RPC response unexpectedly lacks the new handoff flag, the endpoint
still returns the successful completion, but **does not** announce a
handoff; it warns the operator to refresh rather than encouraging a second
consumption request. Low-stock and material-skip notifications remain
best-effort, with the original business rules intact.

The production packet now also displays canonical order consumption-rollup
rows and the stage's persisted `consumption_skipped` reason. An unavailable
ledger is visibly `unavailable`, not falsely shown as zero materials.
The order consumption API now checks authorized visibility of the parent
`draft_orders` row before reading the underlying rollup view, because older
PostgreSQL views can otherwise bypass child-table RLS. No data comes from an
AI model or a parallel fabrication-details form.

## Manual acceptance checklist (staging with real database)

1. Apply the migration and verify PostgREST sees **eight parameters**.
   Confirm anon and authenticated cannot execute the unversioned seven-
   parameter implementation directly. Operator with assigned station can use
   only the versioned RPC for their own station; other stations return 403/SQL
   permission errors.
2. From a CAD/CNC `IN_PROGRESS` stage, open the completion dialog, then have
   another session BLOCK, REWORK or modify the same stage. Attempt completion
   with the original revision: expect conflict and **no** inventory movements.
   Refresh/reopen the workstation.
3. Open an unresolved rework cycle; ensure completion is impossible until
   resolution. Resolving must return the stage to `IN_PROGRESS` and publish
   a newer stage revision.
4. Complete a stage with one or more declared inventory rows. Confirm only one
   set of movements and stock deduction, stage `COMPLETED`, and exactly one
   queue transition to the next station when the next state was
   `NOT_STARTED`.
5. With the next stage already `QUEUED` or `BLOCKED`, complete the current
   one: no extra 'new queued' message or positive handoff receipt should occur.
   Also test optional legacy station stages, which do not autoqueue unrelated
   standard stations.
6. Retry a successful completion via the stale or identical request:
   expect conflict and no second stock deduction. Verify the UI does not
   encourage repeating a committed transaction on a missing chat receipt.
7. Open the production packet from a station card. Confirm real consumed
   SKU/quantity rows are visible; when a stage skipped material declaration,
   show its saved skip reason. A simulated ledger error must produce an
   unavailable message, **not** a fabricated zero-consumption total.
8. Test the consumption endpoint with an unauthorized user and an inaccessible
   order UUID to confirm it cannot leak inventory transactions from the
   legacy rollup view. Verify RU/LV/EN labels and mobile station layout.
9. Preserve R37's read-only original native profile form, R36 Boss-issued PO
   controls and OpenRouter advisory-only behavior.

## Limits / staging instructions

Static GitHub source checks and unexecuted regression tests are not proof
of PL/pgSQL behavior, RLS, transaction isolation or correct browser state.
The ledger preview is capped to 100 returned rows; open the existing order
consumption tab for a longer record. Commit:
`tests/unit/oms-r38-production-execution.test.ts`.

For operator-run staging checks, after installing SQL:

```sh
npm ci
npm run check
npx vitest run tests/unit/oms-r38-production-execution.test.ts \
  tests/unit/oms-r37-production-packet.test.ts \
  tests/unit/oms-r19-production-floor.test.ts
npm run build
```

**No automated workflows required.** Deploy via the existing OMS host only
after the migration and the acceptance steps above succeed.
