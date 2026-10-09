# OMS-R02 — Complete manufacturing lifecycle (repository implementation)

**Commit status:** Code and SQL are in the repository; **NOT deployed or verified against the live DB**. All four R02 migrations (five functions) are required before application deployment. No GitHub Actions, service restart, database migration, credential rotation or NAS operation was performed.

## Canonical order lifecycle

`DRAFT -> PENDING_REVIEW -> CONFIRMED -> IN_PRODUCTION -> READY_TO_LOAD -> DISPATCHED -> ARCHIVED`

- **Intake:** New orders are created as `DRAFT` or `PENDING_REVIEW`, never directly as production/dispatch. External PO assignment is restricted to Boss at confirmation.
- **Confirmation:** RD/Boss/HoP only. Atomically initializes production stages and moves the order to `CONFIRMED`. Existing stages are preserved on retry; row locking serializes competing confirmation. Legacy `/approve` is an alias of `/confirm`.
- **Production:** Authorized managers or assigned operators progress queued stages through `IN_PROGRESS`, `BLOCKED` and `REWORK`. Generic PATCH cannot complete a stage. Completing requires explicit material declaration or skip reason.
- **Completion:** `complete_stage_with_consumption` locks order/stage, validates stock, deducts inventory and audits, completes the stage, and queues the next stage in the SAME PostgreSQL transaction. Repeated/concurrent submissions reject instead of consuming twice.
- **Rework:** Dedicated `open_order_rework` and `resolve_order_rework` store the cycle and its stage state together. Unresolved cycles block loading/dispatch. Rework resolution reopens the station for completion.
- **Loading:** `assign_order_loading_day` locks the loading day and order, checks capacity, blocked day, completed production stages and configured QC, and links via `calendar_events -> loading_events -> loading_event_pos` in one transaction. Repeated assignment is idempotent; unassign moves `READY_TO_LOAD -> IN_PRODUCTION`.
- **Dispatch:** Managers only; must be `READY_TO_LOAD`, have completed required stations and configured QC, zero open rework, a loading date and an actual loading-event PO link. CAS protects duplicate dispatches.
- **Archive:** Only `DISPATCHED` can become `ARCHIVED`; concurrent changes yield 409. Other lifecycle status changes through generic CRUD are blocked.

**Quality policy:** QC is enforced when an explicit QC station row exists. The established standard pipeline is CAD, CNC, EDGE, ASSEMBLY, PAINT, PACKAGING, DELIVERY; QC is not yet automatically inserted for every order. DELIVERY is a post-loading stage and does not block loading.

## CRITICAL deployment order

The current Git main includes **unapplied** R01 `20261009000000_revoke_legacy_loading_lock_execute.sql` and R02 migrations:

1. `20261009000001_complete_stage_with_consumption.sql` — atomic material consumption and stage completion, revoke direct authenticated use of old `consume_materials_for_order` (which trusted caller-provided actor IDs)
2. `20261009000002_assign_order_loading_day.sql` — atomic, capacity-aware loading association
3. `20261009000003_atomic_rework.sql` — atomic rework cycle operations
4. `20261009000004_confirm_order_with_stages.sql` — atomic confirmation and production-stage initialization

On a disposable clone of PostgreSQL 17, back up and dry-run all migrations and all role grants first. Audit dependencies on the old consumption RPC. Test permissions for RD, Boss, HoP, StationHead and Operator. **Apply and verify all required SQL in order before releasing R02 application code.** The application returns 503 for missing new functions instead of silently executing an unsafe fallback.

Do not blindly run `scripts/supabase-migrate.sh push`: it may apply unrelated pending migrations. Use individually reviewed SQL on the intended PostgreSQL 17 instance with backup, migration tracking, and rollback window. The private `.env` preservation instructions from OMS-R00 still apply before the first pull.

## End-to-end staging acceptance script (real database, no production writes)

Use a disposable test environment with distinct users and sample inventory. Record the created test PO and its IDs for cleanup.

1. **Create:** Create `PENDING_REVIEW` test order using the ordinary form/API. Assert no production status is accepted on creation, and unauthorized PO assignment is rejected.
2. **Confirm:** Boss assigns PO; seven standard stage rows are present, CAD queued. Operator/StationHead cannot confirm. Repeat confirmation; no duplicated or reset stages.
3. **Start:** Assigned CAD operator starts the stage, order becomes `IN_PRODUCTION`. Unassigned operator gets 403. Invalid `NOT_STARTED -> COMPLETED` and arbitrary status PATCH are rejected.
4. **Consume and finish:** Complete CAD with known stock; assert one inventory movement and exact stock decrement, CAD completed, CNC queued. Retry same POST; assert 409, no second inventory movement or stock deduction. Test insufficient stock rolls back stage completion.
5. **Rework:** Start CNC, open rework. Assert a cycle exists and stage=REWORK. While open, loading/dispatch fail. Resolve cycle; CNC returns to IN_PROGRESS; finish using consumption or explicit skip reason.
6. **Production:** Complete EDGE, ASSEMBLY, PAINT and PACKAGING. If QC row exists, test that unfinished QC prevents loading; finish QC. DELIVERY need not be completed to load.
7. **Loading:** With a nonblocked day and spare capacity, assign. Assert `READY_TO_LOAD`, date, and `loading_event_pos` link. Reassign same date: idempotent and no extra capacity consumed. Test a blocked/full day rejection. Unassign and reassess status; reassign.
8. **Dispatch:** Attempt dispatch from CONFIRMED/IN_PRODUCTION, expect 409. Dispatch READY order, assert timestamp/actor; repeat idempotently. Archive, assert terminal state and second archive idempotent.
9. **Security/consistency:** Verify direct legacy `consume_materials_for_order` and `toggle_loading_day_lock` RPC execute privileges are removed from authenticated/anon; SQL tables and audit/logs expose only permitted data; no privilege escalation through direct PostgREST.
10. **Performance/recovery:** Concurrent completion requests against one stage yield exactly one successful transaction; backup/restore of test DB succeeds; check app logs for anomalies.

## Validation and limitations

Required release gates: `npm ci`, `npm run test`, `npm run check`, `npm run build`, staging role/API smoke tests, signed-in mobile station UI walkthrough, controlled app-only restart. These have **not been run in this GitHub-only session**.

Remaining limitations: notification writes are best-effort after committed operations; dispatch revisions are best-effort and not transactionally coupled to dispatch; generic order creation can still leave partial child rows if a secondary insert fails. New R02 SQL must be deployed before updated endpoints become operational. Also audit other legacy clients of removed direct material-consumption execution permission. Keep production offline from test writes until staging acceptance is complete.
