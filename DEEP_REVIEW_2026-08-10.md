# reclame-oms — Frontend/Backend Deep Review
Generated: 2026-08-10 | Scope: full `src/` (SvelteKit) + `supabase/` (migrations+functions)
Method: static scan of 151 API routes, 74 tables/views, 33 RPCs; 325 fetch calls, 553 `.from()`, 35 `.rpc()`; `svelte-check` (25 errors, 297 warnings).

## TL;DR (severity-ranked)
1. **CRITICAL — Phantom table `user_profiles`** (2 call sites, used by permission + email systems). Real table is `profiles`; columns queried (`user_id`, `role`) don't exist. Silent failures → wrong roles, no manager emails.
2. **CRITICAL — 4 missing Postgres RPCs** called by frontend/server: `increment`, `max_retries`, `process_sync_queue_batch`, `resolve_sync_conflict`. `(rpc)` throws → features broken (rework counter, sync/conflict resolution, webhook retry cap).
3. **HIGH — Hardcoded `profileCode: 'P7st'`** in order creation (lines 252 & 571). Backend ignores it and stores `profile_template_id = NULL`. Every order profile is orphaned/templateless.
4. **HIGH — Missing backend routes** the frontend calls: `/api/inventory/status`, `/api/filters/[id]`, `/api/webhooks/[id]`, `/api/webhooks/[id]/test`, `/api/draft-orders/[id]/redo`, `/api/draft-orders/[id]/badges`, `/api/backup/[id]`, `/api/station-attachments/[id]`. All 404 silently (no `.ok` guard on some → JSON parse crash or swallowed error).
5. **HIGH — `logout` undefined in +layout.svelte:352** → `ReferenceError` on Sign out (svelte-check ERROR). Sign-out button throws.
6. **MEDIUM — Validation gaps (`ali points`)**: new-order form only checks 3 fields client-side; `deadline`, `loadingDate`, `deliveryContact`, `deliveryPhone`, `priority` untyped/unvalidated; no schema/zod shared with backend. Backend only validates `client`+`due_date`+po length.
7. **MEDIUM — Spinner/loading bugs**: `fetchLoads` store is **never called** (dead code) yet calendar relies on a separate inline `fetch('/api/loading-days')` with no `loading` flag (line 63). Several `loading=true` flags reset only in `finally` (good) but `WebhookManager` initial `loading=true` depends on mount; the *loading-days* area has no `loading`/`error` state at all → blank calendar + possible "forever loading" feel.
8. **LOW — 25 svelte-check compile errors** (IconName mismatches, type mismatches, `nullable` ordering bug in `delivery-presets`, `StationTag` misuse, `User` missing `role`). 297 warnings (a11y label/CSS).

## 1. Phantom table `user_profiles` (CRITICAL)
- `src/lib/server/permissions-service.ts:152` → `.from('user_profiles').select('role').eq('user_id', userId)`
- `src/lib/server/email-triggers.ts:121` → `.from('user_profiles').select('user_id, user:auth.users(email)').in('role',['admin','manager'])`
- Reality (supabase/migrations/20260204000002_user_profiles.sql): table is `profiles` with PK `id` (FK to auth.users), `roles JSONB`, NO `user_id`, NO `role` text column.
- Effect: `getUserRole()` returns `null` always → permission checks degrade; email-triggers gets empty `managers` → no manager/order notifications ever sent.
- Fix: rename to `profiles`, use `id = userId` and read `roles` JSONB (e.g. `roles->>'primary'` or array contains), or create a proper `user_profiles` view.

## 2. Missing RPCs (CRITICAL/HIGH)
- `increment` — `src/lib/server/workflow/ReworkService.ts:92` `rewrite_count: rpc('increment',{row_id})`. No `CREATE FUNCTION increment`. Supabase has no built-in `increment` by default.
- `max_retries` — `src/lib/server/webhook-service.ts:219` `lt('retry_count', rpc('max_retries'))`. Called as a scalar subquery; no such function → query throws.
- `process_sync_queue_batch` — `src/lib/pwa/sync-manager.ts:133`. Offline sync cannot flush → PWA data stuck.
- `resolve_sync_conflict` — `src/lib/components/ConflictResolver.svelte:51`. Conflict resolution button does nothing (rpc error swallowed in catch).
- Fix: add the four functions in a new migration (e.g. `increment(row_id uuid, ...)`, `max_retries() returns int`, sync queue + conflict resolvers).

## 3. Hardcoded profileCode (HIGH, data integrity)
- `src/routes/orders/new/+page.svelte:252` and `:571` → `profileCode: 'P7st'` for every profile entry.
- Backend `POST /api/draft-orders` (line 152) inserts `profile_template_id: p.profileTemplateId || null` and **never reads `profileCode`**. Frontend never sends `profileTemplateId`.
- Effect: all `order_profiles` rows created with `profile_template_id = NULL`. Reports/templates that key off template_id show blank/unknown profile type.
- Fix: send `profileTemplateId` (from selected template) and/or map `profileCode`→`profile_template_id` server-side; remove the hardcoded literal.

## 4. Frontend calls with NO backend route (HIGH)
Verified missing (frontend fetch → 404):
- `/api/inventory/status` (MaterialSelector.svelte:77) — no handler; `inventoryStatus` stays undefined, no `.ok` check → `await response.json()` on 404 HTML throws/crashes in select.
- `/api/filters/${id}` PATCH + DELETE (AdvancedSearch.svelte:166) — `filters/[id]` dir absent; comments for these handlers live in `filters/+server.ts` but no subroute file.
- `/api/webhooks/${id}` DELETE + `/api/webhooks/${id}/test` (WebhookManager.svelte:140,149) — `/api/webhooks/[id]` dir absent.
- `/api/draft-orders/${id}/redo` & `/api/draft-orders/${id}/badges` (orderState.svelte.ts:371,345) — no subroutes.
- `/api/backup/${id}` DELETE (BackupDashboard.svelte:142) — only `backup/+server.ts` (no `[id]`).
- `/api/station-attachments/${id}` DELETE (AttachmentGallery.svelte:108) — no route.
- Fix: either add the missing `+server.ts` files or remove the dead calls. At minimum add `.ok` guards + error toasts so failures aren't silent.

## 5. `logout` ReferenceError (+layout.svelte:352) (HIGH)
- svelte-check ERROR: `Cannot find name 'logout'.` The Sign-out button calls `await logout(authStateInstance)` but `logout` is not imported/in-scope in the layout. Clicking Sign out throws `ReferenceError` in the browser.
- Fix: import `logout` from the auth lib or call `authStateInstance.logout()`.

## 6. Validation points / "ali points" (MEDIUM)
New-order form (`orders/new/+page.svelte` `saveOrder()`):
- Only validates: `clientName` non-empty, `uploadedFiles.length>0`, `deliveryAddress || selectedPresetId`.
- NOT validated: `deadline` (no past-date/required check despite being a required DB field), `loadingDate` (date but unvalidated format), `deliveryContact`, `deliveryPhone` (free text, no phone pattern), `priority` (accepts any string), `profiles[].quantity` (only `min=1 max=100` HTML attr, bypassable).
- No shared validation schema between FE and `POST /api/draft-orders` (backend only enforces client+due_date+po length). Mismatch risk: backend can still create with `status:'PENDING_REVIEW'` even if deadline missing (it maps `due_date = body.deadline || body.due_date` then checks `!due_date` → OK it does check). Good that backend checks, but FE lets user submit then gets 400 — poor UX, no field-level error mapping.
- Recommendation: add zod schema shared via `$lib/validation`, map 400 field errors back to fields, validate phone/date formats, and block submit while `saving`.

## 7. Loading / spinner ("forever loading") bugs (MEDIUM)
- `src/lib/state/loads.ts` exports `fetchLoads()` + `loadsLoading` store, but **no component ever imports/calls `fetchLoads`** (grep: only self-reference). Dead store.
- `src/routes/calendar/+page.svelte:61-70` `refreshLoadingDays()` does `fetch('/api/loading-days?active=true')` with **no `loading` flag and no error state** — if the request hangs or errors, UI shows nothing and there's no spinner/empty/error indicator. This matches the reported "loading days spinner / loading indefinitely" symptom: the calendar marks days `isLoading` (a separate boolean derived from data) but the *fetch* itself has no loading UI and no timeout/retry.
- `WebhookManager.svelte` starts `loading = true` and only resets inside `loadWebhooks()` (called onMount) — fine, but if mount fetch fails there's no error branch.
- Recommendation: wire `loadsLoading` into `refreshLoadingDays`, add `{#if loading}…{:else if error}…{:else if empty}…{/if}`, add a fetch timeout/AbortController.

## 8. Compile errors (LOW but real)
25 svelte-check errors, highlights:
- `src/routes/api/delivery-presets/+server.ts:65` — `.order('x', { nullable: ... })` invalid key (should be `nullsFirst`/`nullsLast`).
- `src/routes/api/orders/+server.ts:36` — `.in('id', supabase.from('order_stages')...)` returns a filter builder, not an array; station filter broken at compile + runtime.
- `src/routes/api/profiles/templates/[code]/export/+server.ts:58` — `Cannot find name 'user'` (probably meant `locals.user`).
- `src/routes/admin/+layout.server.ts:34` — comparing `string` to `boolean`.
- `src/lib/users/station-assignments.ts:20,22` — `StationTag` type mismatch.
- `src/routes/login/+page.svelte:124` — constructed `User` missing `role`.
- Multiple `IconName`/IconSize mismatches (`bar-chart-2`, `check-square`, `git-pull-request`, `calendar-check`, `package-check` not in set).
These won't necessarily crash at runtime (some are type-only) but several (delivery-presets order, orders station filter, export `user`) are genuine runtime bugs.

## 9. Other observations
- `src/routes/orders/+page.svelte` and others use `fetch('/api/...')` with hardcoded `/api` instead of `${base}/api` — breaks under a non-root base path (subpath deploy / proxy). Inconsistent with the store-based calls that use `base`.
- Many `fetch` calls lack `{#if !res.ok}` guards; several swallow errors with only `console.error`, leaving silent UI failures.
- PWA sync (`sync-manager.ts`) depends on 2 missing RPCs → offline-created records never reconcile.

## Prioritized fix list
1. Add 4 missing RPCs (migration). [CRITICAL]
2. Fix `user_profiles` → `profiles` (2 files). [CRITICAL]
3. Add missing `[id]` server routes OR guard+remove dead calls (8 endpoints). [HIGH]
4. Fix `logout` import in +layout.svelte. [HIGH]
5. Remove hardcoded `profileCode`, send real `profileTemplateId`. [HIGH]
6. Shared validation schema + field error mapping for new order. [MEDIUM]
7. Add loading/error/empty states to loading-days fetch; wire `loadsLoading`; dead-code `fetchLoads`. [MEDIUM]
8. Resolve the 25 svelte-check errors (esp. delivery-presets, orders station filter, export user). [LOW/MED]
9. Standardize on `base` for all internal fetches. [LOW]
