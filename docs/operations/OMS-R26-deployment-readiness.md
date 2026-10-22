# OMS release — Production deployment and end-to-end readiness

R26 introduced the read-only production checks; this runbook now covers the
current production and inventory release contracts through R44. It supplies
manual, non-mutating database and HTTP checks. No GitHub Actions, automatic
database migration or production write is performed.

## Required migration order

Inspect the migration log, create a database backup, and apply pending changes
on staging **in timestamp order** before deploying the corresponding app code.

- R02 `20261009000001_complete_stage_with_consumption.sql`
- R17 `20261014000001_order_edit_concurrency_and_audit.sql`
- R21 `20261014000002_production_station_capacity.sql`
- R22 `20261014000003_production_reservation_approvals.sql`
- R25 `20261014000004_production_exception_reviews.sql`
- R36 `20261016000001_confirmation_handoff_guards.sql`
- R38 `20261016000002_versioned_stage_completion_handoff.sql`
- R40 `20261016000003_production_oversight_review_kinds.sql`
- R41 `20261016000004_inventory_audit_atomic_manual_movements.sql`
- R42 `20261016000005_canonical_inventory_consumption.sql`
- R44 `20261018000001_inventory_replenishment_requests.sql`
- Order-child access `20261021000001_fix_order_access_assignee_column.sql`
- Station update actor `20261021000002_order_stage_update_actor.sql`
- Chat schema and order-linked room access `20261021000003_chat_schema_contract.sql`

Apply all other required OMS migrations as well, including rework, loading,
order confirmation, forms and access controls. The list above supplements
those earlier prerequisites; it is not a database reset script. Do not assume
pushing code applies SQL. Feature-specific prerequisites and acceptance
details remain in each R36–R44 handoff document.

### Database preflight (read-only)

After backing up and applying migrations in staging, from the OMS checkout:

```sh
npm run supabase:preflight
```

It uses the existing `supabase-db` Docker container when available; otherwise
the locally configured `DATABASE_URL` and `psql`. Connection credentials are
no longer printed by the migration script's list and push messages.

The preflight checks production and inventory relations, RPC signatures,
authenticated/anon grants, RLS and inventory write-RPC security-definer status.
It also displays counts of unmatched or divergent legacy inventory mappings
for manager review. It opens a READ ONLY transaction and ROLLBACKs. A missing
prerequisite causes a nonzero exit status. Do **not** run against the live
database as your first test.

The version-checked eight-argument stage-completion RPC must be executable by
authenticated users; the internal seven-argument implementation and
`consume_materials_for_order` helper must not be. The preflight checks this
boundary as well as the R41/R42 inventory RPC grants.

### Manual HTTP smoke (read-only)

Provide an authenticated **staging** session cookie and HTTPS staging URL via
local environment variables (never check cookies into Git or paste into issues):

```sh
OMS_STAGING_URL=https://staging.example.test \
OMS_STAGING_COOKIE='paste-session-cookie-locally' npm run oms:staging-smoke
```

Use a manager session because the checks include management-only inventory
diagnostics. The script probes the production board, station capacity,
all-dates approved snapshot, reservation ledger, 7-day performance,
exception-review ledger, inventory movements, stock consistency and
replenishment board with GET. It also checks the intentionally public,
read-only build fingerprint and, when a saved replenishment request exists,
its bounded audit history. It validates basic payload completeness and
anonymous-denial behavior for protected routes. It changes no data and never
logs session cookies or full order data.
Host allowlisting requires an explicit staging-like hostname (or localhost).
An arbitrary Tailscale address is **not** assumed to be staging. Override
with `OMS_ALLOW_NONSTAGING=1` only after verifying the destination is a
safe staging instance. Clear the environment variable after the test.

**This is not a full authorization test.** Run a separate browser pass as an
operator, StationHead, manager, and inactive user, confirming expected
403s on unauthorized actions and actual RLS-scoped order visibility. The
smoke test does not POST or mutate anything, even with a manager cookie.
It checks only the first page of stock consistency and does not prove a full
physical inventory count or reconcile any discrepancy.

### Staging acceptance sequence

1. `npm ci`, `npm run check`, `npm run lint` where feasible,
   `npx vitest run tests/unit/oms-r26-deployment-readiness.test.ts`,
   then `npm run build`.
2. Back up staging DB, review migrations, apply in correct order, and
   run `npm run supabase:preflight`.
3. Deploy the app on staging and run the read-only HTTP smoke.
4. As a manager: draft → edit (test stale revision) → confirm → stage
   assignments → upload order files → station progress note → book
   station capacity → approve reservation → complete with materials →
   schedule loading → dispatch.
5. As an operator: verify assigned-station-only changes and compare
   progress with manager view; verify an inactive account cannot write.
6. Validate R23 forecast totals against approved bookings, R24
   actual-vs-estimate and R25 exception detection and audit events.
   Simultaneous approval tests must use two manager sessions against a
   designated staging fixture, never real customer orders.
7. Test unknown actual hours, manual actual=0, blocked/rework,
   stale reservations, missing migration, network outage and data gaps.
8. Repeat RU/LV/EN UI and phone/desktop workflows, then review any
   performance or permissions findings before deploying production.
9. For inventory, complete the role, idempotency, parity and procurement
   lifecycle checks in the linked R41, R42 and R44 staging acceptance lists.
   Use a physical count for stock reconciliation; replenishment closure is
   not a goods receipt.

## Limitations

The paginated endpoints now check exact counts, duplicate identities and
truncated pages. This reduces partial-result risk, but independently issued
PostgREST pages are **not** a transactional snapshot. Stable count alone
cannot detect every concurrent edit. A real snapshot isolation requirement
needs a server-side database RPC with appropriate transaction isolation.

Passing these checks is evidence for the specific staging target and revision
tested; it is not a guarantee about another database or deployment. Record
release results in the approved release record rather than editing this
runbook with environment-specific values.
