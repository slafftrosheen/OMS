# OMS-R26 — Production deployment and end-to-end readiness

R26 hardens read-only production-board and performance/history pagination and
supplies two **manual, non-mutating** deployment checks. No GitHub Actions,
no automatic database migration, no production write.

## Required migration order

Inspect the migration log, create a database backup, and apply pending changes
on staging **in timestamp order** before deploying the corresponding app code.

- R02 `20261009000001_complete_stage_with_consumption.sql`
- R17 `20261014000001_order_edit_concurrency_and_audit.sql`
- R21 `20261014000002_production_station_capacity.sql`
- R22 `20261014000003_production_reservation_approvals.sql`
- R25 `20261014000004_production_exception_reviews.sql`

Other OMS migrations (rework, loading, order confirmation, forms and access
controls) must also be present. Do not assume pushing code applies SQL.

### Database preflight (read-only)

After backing up and applying migrations in staging, from the OMS checkout:

```sh
npm run supabase:preflight
```

It uses the existing `supabase-db` Docker container when available; otherwise
the locally configured `DATABASE_URL` and `psql`. Connection credentials are
no longer printed by the migration script's list and push messages.

The preflight checks canonical relations, RPC signatures, authenticated/anon
grants and RLS and displays counts of data requiring review. It opens a
READ ONLY transaction and ROLLBACKs. A missing prerequisite causes a nonzero
exit status. Do **not** run against the live database as your first test.

### Manual HTTP smoke (read-only)

Provide an authenticated **staging** session cookie and HTTPS staging URL via
local environment variables (never check cookies into Git or paste into issues):

```sh
OMS_STAGING_URL=https://staging.example.test \
OMS_STAGING_COOKIE='paste-session-cookie-locally' npm run oms:staging-smoke
```

The script probes the board, station capacity, all-dates approved snapshot,
reservation ledger, 7-day performance and exception-review ledger with GET.
It validates basic payload completeness and anonymous-denial behavior.
It checks no changes and never logs session cookies or full order data.
Host allowlisting requires an explicit staging-like hostname (or localhost).
An arbitrary Tailscale address is **not** assumed to be staging. Override
with `OMS_ALLOW_NONSTAGING=1` only after verifying the destination is a
safe staging instance. Clear the environment variable after the test.

**This is not a full authorization test.** Run a separate browser pass as an
operator, StationHead, manager, and inactive user, confirming expected
403s on unauthorized actions and actual RLS-scoped order visibility. The
smoke test does not POST or mutate anything, even with a manager cookie.

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

## Limitations

The paginated endpoints now check exact counts, duplicate identities and
truncated pages. This reduces partial-result risk, but independently issued
PostgREST pages are **not** a transactional snapshot. Stable count alone
cannot detect every concurrent edit. A real snapshot isolation requirement
needs a server-side database RPC with appropriate transaction isolation.

This change was authored through the GitHub connector without a local OMS
checkout, database credentials or a staging web session. Compile, tests,
SQL preflight and HTTP smoke were **not run** by the assistant.
