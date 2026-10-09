# OMS-R01 — Live contract reconciliation

**Status:** Repository code updated; live PostgreSQL/PostgREST tests and release gates still required.
**Environment:** Tailnet OMS systemd app, separate self-hosted Supabase PostgreSQL 17 stack. A narrow SQL migration is **included in Git but not executed**; no runtime restart or live DB change was performed.

## Corrected contracts

| Subsystem | Previous source of failure | R01 contract |
| --- | --- | --- |
| Orders export | Nonexistent `draft_orders -> loading_days` direct FK and `assignees(email)` | Explicit `loading_date -> loading_days.date`, `order_assignees(draft_order_id, assignee_id)` |
| Loading schedule export | Nonexistent `loading_days -> draft_orders` direct FK | `calendar_events(kind=loading, date)` -> `loading_event_pos(loading_event_id, draft_order_id)` -> `draft_orders` |
| CSV export | Filesystem `temp.csv` and CommonJS `require('fs')` in SvelteKit ESM | In-memory CSV writer with RFC-style quotes and formula escaping |
| Station logs | RPC called with nine historic arg names; timeline view lacks `id, order_id, log_type` | `create_station_log(p_station, p_action, p_details)`; metadata in JSONB `details`, timeline read via `action` and JSON fields |
| Legacy singular station-log | Blind insert of `po/notes/redo` columns that do not exist | Compatibility endpoint resolves PO to draft ID and calls same RPC |
| Loading capacity | View queried `capacity_status`, live view has `state` | Filter by `state` with compatibility labels (ok/open, warning/tight) |
| Loading lock | Legacy RPC accepts only `p_date` and **toggles**; wanted set `lock=true/false` | Idempotent direct `loading_days.is_blocked` update by ID, elevated API role required and DB RLS still active |
| Station board | FK embed to updatable `orders` view, different station lists | Explicit `order_stages.draft_order_id -> draft_orders.id` joins in code and shared station registry |
| ICS loading calendar | Wrong mapping of `loading_event_id` to `loading_days.id`, missing return value | Resolve calendar event date, load junction orders, return `calendar.toString()` |
| Calendar event API | Legacy `order_id` on `loading_event_pos` | Canonical `draft_order_id` |

## Deployment / operations

These fixes rely on the 2026-10-08 live-schema audit and tracked SQL migrations. They have **not** been checked against the running DB in this session. On production, verify the current `pg_get_function_identity_arguments`, view columns, RLS privileges and table access before calling the release verified. R00 changed the 15 user-facing routes to request-scoped clients; test under actual roles (RD, Boss, HoP, station head, operator).

Known prerequisites: the export API still uploads to Supabase Storage bucket `exports` and writes `export_history`; the deployment report listed only `files` and `station-attachments`. Verify `exports` exists, is private, permits relevant authenticated users through storage policies, and that `export_history` exists and allows inserts/updates. Do not create a public bucket as a quick fix. Ensure signed download URL can be opened. This commit does **not** provision buckets.

### Manual smoke run after app-only build

1. Backup `.env` outside Git and follow the R00 first-pull checklist if needed.
2. `npm ci`, `npm run test`, `npm run check`, `npm run build` (prior VoiceInput diagnostic was reported as a pre-existing issue; don't hide new errors).
3. Test order export as Excel, PDF and CSV, and a loading-schedule export linked to one known order. Check the signed file and filename, not only a 200 JSON response.
4. Submit a station log with an order ID; GET filtered station logs and verify `details.order_id` and `details.is_issue`. Test legacy singular endpoint with a valid PO.
5. Toggle the same loading day to `true` twice, then `false`; confirm no reversal on repeated requests and a station operator gets 403.
6. Inspect the live station list for both workflow and legacy stations; start/finish a stage and verify the expected next stage, no missing rows.
7. Subscribe to a loading ICS feed and confirm a `BEGIN:VCALENDAR` body with the correct date and linked PO description.
8. Verify no mass-exposure under RLS by testing a restricted user's exports and detail pages, and test /api/healthz plus /api/health after restart.

The Git commit includes an unapplied permission-revocation SQL migration. No Docker Compose service, running database, storage bucket, credential, systemd unit, or production runtime state was modified.

## Known remaining risks (next batch)

- The deployed `toggle_loading_day_lock(p_date)` SECURITY DEFINER function allows any authenticated user. R01 stops using it from the API, **but the function remains directly callable if grants allow**. Audit/revoke its direct execution through a separately approved SQL migration after inspecting live grants; do not assume an API-side guard protects PostgREST RPC.
- Several unrelated old APIs still use stale columns and duplicated workflows. The entire repository is not contract-clean.
- Station workflow codes have one shared registry in the changed code, but the final physical production sequencing still needs operational confirmation.
- `exports` bucket and `export_history` are not verified; live export cannot be claimed end-to-end functional yet.

## Migration release gate (not automatically applied)

The R01 migration only revokes direct RPC execution from ordinary users. Check live catalog first:

```sql
SELECT pg_get_function_identity_arguments('public.toggle_loading_day_lock(date)'::regprocedure);
SELECT has_function_privilege('authenticated', 'public.toggle_loading_day_lock(date)', 'EXECUTE');
SELECT has_function_privilege('anon', 'public.toggle_loading_day_lock(date)', 'EXECUTE');
```

Review the SQL and back up the database before a **separately approved** migration application. Do not use `npm run supabase:migrate:push` blindly: the runner may apply every pending migration, not just this one.
