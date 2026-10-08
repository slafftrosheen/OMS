# Deep Review — reclame-oms (Oct 8, 2026)

Full-stack contract audit after the OpenRouter-only AI cutover (`b035b43`). Method:
static inventory of 149 API routes (methods parsed), 98 distinct frontend call paths
(direct + variable-built URLs), 27 `.rpc()` names and 94 `.from()` targets, diffed
against the **live** Postgres catalog (77 tables, 13 views, 40 functions), plus
per-caller signature comparison and loading/validation sweeps. Gates at review time:
`npm run check` → 0 errors / 312 warnings; `npm run test` → 94/94; worktree clean.

Severity legend: **C** = broken at runtime today, **H** = wrong data/UX or auth gap,
**M** = latent breakage, **L** = cleanup.

---

## A. Findings — confirmed against live source

### A1. CRITICAL — permission system resolves against nonexistent schema
- `src/lib/server/permissions-service.ts` calls:
  - `.rpc('user_has_permission', {p_user_id, p_permission_name})` — **no such function** in any schema. `hasPermission()` returns `false` on the RPC error → `requirePermission()` (used by `/api/backup`, `/api/permissions`, `/api/audit/*`) **always throws "Permission denied"**.
  - `.from('user_all_permissions'|'permissions'|'user_permissions'|'role_permissions_view'|'roles')` — **none exist**. Every read path returns `[]`.
- Live RBAC is enforced elsewhere: `profiles.role` + `is_admin()`/`canManageSharedInventory()`/`requireAdmin()` helpers. These 6 route families are the only PermissionsService consumers, so the blast radius is contained — but every call is a guaranteed 500/error, not an auth check.
- **Fix direction:** reimplement PermissionsService on `profiles.role` (+ the live permission helpers), or create the backing tables/functions. Do not leave dual systems.

### A2. CRITICAL — audit-service logs to nonexistent RPCs/tables
- `src/lib/server/audit-service.ts`: `log_audit`, `log_activity`, `log_security_event` RPCs missing (live has `create_audit_log`); tables `activity_logs`, `security_events` missing (live: `audit_log`, `order_activity_log`, `station_logs`).
- Callers: `/api/audit/logs`, `/api/audit/security` (list + POST + resolve), `AuditDashboard.svelte` (mounted **nowhere**), and `permissions-service.ts` `requirePermission` → `log_security_event`.
- Net effect: security-event logging is a silent no-op; the audit UI/`/api/audit/*` endpoints return empty/error.
- **Fix direction:** route AuditService through `create_audit_log` + `audit_log`/`order_activity_log`, or delete `/api/audit/*` + AuditDashboard if the feature is retired.

### A3. CRITICAL — production station board PATCH never reaches the right contract
- `src/routes/production/+page.svelte` `handleStatusChange()` PATCHes `/api/orders/${orderId}/stages` with **body `{stage, status}` and no `?station=` query**.
- Handler (`/api/orders/[id]/stages`) requires `?station=` (400 without it) and expects `body.state` ∈ `VALID_STATES` — `status` is silently ignored. **Every stage update from the production board fails with 400 and the UI still "succeeds" (no `.ok` check, no error surfaced).**
- Contrast: `orders/[id]/+page.svelte` uses `buildStagePatch()` (`?station=X`, `{state}`) correctly — tested by `stage-contract.test.ts`. The production page bypasses the shared contract helper.
- **Fix direction:** use `buildStagePatch` here too, and surface errors via notifications.

### A4. HIGH — export route embeds an unresolvable relationship
- `src/routes/api/export/+server.ts` (orders export): `draft_orders.select('*, loading_day:loading_days(date,notes), assignees_data:assignees(email)')`.
  - No FK in either direction between `draft_orders` and `loading_days` (verified `pg_constraint`); `draft_orders.assignees` column does not exist (`order_assignees` junction exists but isn't referenced). PostgREST returns **PGRST200 "Could not find a relationship" → orders export 500s**.
- Also in the same file, loading-schedule export: `loading_days.select('*, orders:draft_orders(*)')` — same missing-FK problem (only link is via `loading_event_pos` junction, which the embed doesn't name). **Loading-schedule export 500s.**
- **Fix direction:** load loading-days separately (two queries + join in JS), and pull assignees from `order_assignees`.

### A5. HIGH — CalendarService ICS feed queries dead columns
- `src/lib/server/calendar/CalendarService.ts:127-129`: `loading_days.select('*, orders!inner(...)').gte('loading_date', ...)` — `loading_days` has **no `loading_date` column** (it's `date`) and no FK to `draft_orders` (embed unresolvable). `generateLoadingCalendar()` throws → `/api/calendar/feed/[token]` (type `loading`) and `/api/calendar/subscribe` return 500.
- **Fix direction:** `date` column + explicit two-step query or `loading_event_pos` junction embed.

### A6. HIGH — extract-pdf queries nonexistent columns on `order_files`
- `src/routes/api/ai/canvas/extract-pdf/+server.ts:93`: `.from('order_files').select('storage_key, mime_type, file_name').eq('id', fileId)` — live junction has only `id, draft_order_id, file_id, file_type, display_name`; storage metadata lives in `files`. **PDF → form extraction always 500s ("File not found" or column error).**
- Also note `fileId` here is the **`files.id`** (from canvas document shapes) while the select filters `order_files.id` — two wrongs that would cancel only by coincidence.
- **Fix direction:** mirror `files/[fileId]/download/+server.ts`: select `files!inner(*)` through the junction filtered by `file_id`.

### A7. HIGH — SearchService invents columns
- `src/lib/server/search/SearchService.ts`: `materials.select('id, name, category, current_stock').ilike('name', ...)` — live columns are `name_en/name_ru/name_lv`, `stock` (not `name`/`current_stock`). Search-by-name on materials **fails or returns nothing**.
- Same file: `order_files.select('id, file_name, order_id')` — no `file_name` (it's `display_name`/`files.filename`), no `order_id` (it's `draft_order_id`). Files search is broken the same way.
- **Fix direction:** use live columns; note the FE-visible global search (`/api/search`) may hit the same SearchService — verify which paths are mounted.

### A8. HIGH — email/notification services query dead objects (latent, unused today)
- `src/lib/server/email-service.ts`: `.rpc('generate_daily_digest')`, tables `email_queue`, `email_delivery_log` — none exist. Mounted only by `/api/emails/queue` (no FE caller today).
- `src/lib/server/email-triggers.ts`: `.rpc('queue_email' | 'send_order_notification')`, `station_logs.select('order:draft_orders(..., assignees)')` — RPCs missing; `assignees` not a column. No live caller found (email triggers not wired).
- `src/lib/server/qr/QRCodeService.ts`: tables `qr_codes`, `qr_scan_logs` — live table is `order_qr_codes`; `generate_order_qr_code` RPC **is** used by `/api/qr-codes` correctly. QRCodeService itself: no live caller.
- `src/lib/server/inventory/InventoryService.ts`: `materials.current_stock`/`name`/`stock_movements` — wrong columns + missing table (`inventory_movements` exists, `stock_movements` doesn't). Not mounted by any route today.
- **Fix direction:** these are dead-or-unwired services; either wire them to live objects when the feature activates, or delete them now to stop future trips.

### A9. HIGH — PWA offline sync calls wrong RPC shape
- `src/lib/pwa/sync-manager.ts` (mounted via `OfflineIndicator` in `+layout.svelte`, so **reachable**): `.rpc('process_sync_queue_batch', {p_device_id, p_queue_items:[{entity_type,entity_id,operation,payload,client_timestamp}]})` — live signature is `(p_device_id text, p_queue_items jsonb)`; **extra keys `p_device_id` is fine but `p_queue_items` items must match what the function reads**. Function exists; whether item sub-keys match its body needs a live test — flag for verification (arg-shape mismatch risk).
- `ConflictResolver.svelte` calls `resolve_sync_conflict` correctly (arg names OK) but the component is **mounted nowhere** → dead UI.
- `src/lib/stores/offline.ts` (`getEndpointForEntity` → `/api/photos`, `/api/comments`): **no such routes**; store imported nowhere → dead code.

### A10. MEDIUM — station-logs API contract split-brain
- Two routes write logs:
  - `/api/station-logs` POST → `.rpc('create_station_log', {p_order_id, p_station, p_log_type, p_message, p_new_stage, p_details, p_quality_score, p_is_issue, p_tags})` — live function takes only `(p_station, p_action, p_details)`. **Every station-logs POST fails with "function does not match" (argument-name resolution failure).** No FE caller found today, so silent.
  - `/api/station-log` (singular) POST → spreads FE body `{po, station, notes, redo}` straight into `station_logs` insert — `po`, `notes`, `redo` are not columns (live: `action`, `details`, `order_id`). **Insert fails PGRST204.** Caller: `journal.ts` `logStage()` (used by `QuickLogger.svelte`, mounted nowhere). GET ignores `po`/`station`/`limit` params it's given.
- **Fix direction:** single route; map FE payload → `create_station_log(p_station, p_action, p_details)` and pass `order_id` via resolved UUID.

### A11. MEDIUM — loading-days capacity lock mismatch
- `/api/loading-days/capacity` POST → `.rpc('toggle_loading_day_lock', {p_loading_day_id, p_lock})` — live function takes `(p_date date)` and ignores `p_lock` (it toggles). **Lock endpoint fails (arg resolution).** No FE caller yet (logistics dashboard reads capacity only).
- Also `capacity_status` filter col queried by GET — verify it exists on `loading_capacity_overview` view (not checked).

### A12. MEDIUM — `replace_order_profiles` fallback writes to wrong column
- `src/routes/api/draft-orders/[id]/+server.ts:135-145`: RPC called with `{target_order_id, new_profiles}` but live signature is `(p_order_id, p_profiles)`. **RPC path always errors** → code falls into the manual fallback, which inserts `{order_id: ...}` into `order_profiles` — live column is `draft_order_id`. **Manual fallback also fails → order updates with profiles 500.**
- Caller: whoever uses PUT `/api/draft-orders/[id]` with profiles (edit flow). Needs a live repro to be sure RLS/state allows it, but both branches are broken by construction.
- **Fix direction:** call RPC with `p_order_id`/`p_profiles`; fix fallback column; delete fallback after one verified pass.

### A13. MEDIUM — status/priority casing drift
- Live `draft_orders.status` values are UPPERCASE (`PENDING_REVIEW`); `POST /api/orders` defaults `status='draft'`, `priority='normal'` (lowercase; live sample is `LOW`). No FE caller uses POST `/api/orders` today (`stores/orders.ts.create()` unused), but the route is a live footgun.
- `orderState.svelte.ts updateOrder()` sends `status: 'draft'|'pending'` — lowercase values written raw through PUT (schema is `z.string()`). No FE caller found for `orderState.updateOrder` today, same footgun class.
- `/api/station/[station]/orders` filters `.in('order.status', ['active','draft'])` — lowercase values that **do not exist** in `draft_orders` (live: `PENDING_REVIEW`, `CONFIRMED`, `IN_PRODUCTION`, `READY_TO_LOAD`...). The station board via this route returns **empty always**. (The production dashboard uses `/api/production/board`, a different route — verify which page actually uses this one; `station/[station]/+page.svelte` exists and presumably calls it.)
- **Fix direction:** normalize status enum at write boundaries (single shared zod enum FE+BE), fix the station filter to live values.

### A14. LOW — dead/dangling backend routes (no FE caller)
Inventory of routes with zero frontend references (many are intentionally API-first or called by workers; a sample to review for deletion): `/api/ai/analyze-order`, `/api/ai/generate-description`, `/api/analytics/predictions`, `/api/audit/security` POST/PATCH, `/api/backup/process`, `/api/batch`, `/api/calendar/feed/[token]`+`/api/calendar/subscribe` (but broken — A5), `/api/chat/dm`, `/api/chat/search`, `/api/conversations*`, `/api/dashboard/stats`, `/api/emails/queue`, `/api/metrics`, `/api/orders/pending-review` (review page reads via `?status=`?), `/api/orders/search`, `/api/permissions`, `/api/profiles/templates/*` extras (clone/export/rollback/versions/import/validate), `/api/search/global`, `/api/webhooks/process`.
- Several duplicate one-another (`/api/station-log` vs `/api/station-logs`, `/api/conversations` vs `/api/chat`, `/api/audit-log` vs `/api/audit/logs`). Consolidate to one of each.

### A15. LOW — duplicate stage-contract helper on the server
- `buildStagePatch`/`updateStageRows` exist in both `src/lib/order/stage-contract.ts` and `src/lib/server/authz/shared-data.ts`. Keep the client one; drop the server copy if unused.

### A16. INFO — global health reporting
- `/api/health` reports `openrouter: error — key not configured` (expected; awaits R&D key). Database/auth ok. Unrelated to findings above.

---

## B. Validation audit ("ali points")

Sweep of POST-ing pages: overall state is **good** — the core order flow (`orders/new`) uses a shared schema (`validateOrderForm`) with per-field errors, banner summary, and explicit partial-failure messaging for attachment retries. Login/signup has client-side required/password-strength checks and surfaces server errors. Remaining gaps:

1. **`calendar/+page.svelte createLoadingDay`** — no user-visible error on failure (`console.error` only); success path silent-assumes. A failed POST just closes nothing (modal stays) but shows nothing. *Add notifications.error.*
2. **`production/+page.svelte`** — stage PATCH (A3) has no `.ok` check *and* no user error path. Worst offender.
3. **`admin/users`** — no client-side email-format check (server validates password strength + required; email format unchecked server-side too — verify). Username uniqueness error only surfaces after submit (acceptable), but no inline email validation is an ali point.
4. **`ai-lab/chat`** — sends empty message if input is whitespace-only (no trim check before POST).
5. **`orders/review` confirm** — `poInput.trim()` sent; empty PO → server decides; confirm modal shows errors properly. OK.
6. **`station/[station]`** — rework/block modals guard `reason.trim()` before submit (client-side), errors surfaced via notifications. OK.

## C. Loading/error-state audit

Only one confirmed silent-failure site: `production/+page.svelte` (both fetches — load data swallows non-200 via `data.success` fallback; stage PATCH ignores response entirely). Calendar page has loading/error flags for reads and writes to console only (see B1). All other audited flows check `.ok`/catch and notify.

## D. What checked out clean

- All 98 distinct FE call paths resolve to existing routes (after fixing scanner normalization); no phantom endpoints in *active* UI flows.
- Order-detail stage updates, confirm/reject, dispatch/archive/void, draft-orders create with shared zod schema, files upload/list/download, materials admin CRUD, preferences, users admin, OpenRouter settings — caller↔handler↔live-schema all match.
- RPC argument names verified against `pg_get_function_identity_arguments` for 14 hot RPCs: all OK except the ones flagged above.
- 18 `.from()` misses in the earlier pass reduce to 6 files (audit/permissions/email/qr/inventory/webhook services + 2 views) — none in an active page path except as flagged.
- RLS: `orders` view over `draft_orders` is plain (no archive filter — archived set is empty today; revisit when archive flow activates). 5 tables have RLS off (`ai_nodes`, `ai_tools`, `cnc_feeds_speeds`, `paint_matches`, `sync_conflicts`) — read-only tool data + one dead table; low risk, worth enabling.

## E. Baseline gates (actual output)
- `npm run check`: **0 errors**, 312 warnings (pre-existing).
- `npm run test`: **94/94 passed**.
- `npm run build` (earlier today, same tree): success.
- Worktree: clean at `c45b971`.
