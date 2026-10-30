# OMS cross-module contracts and verification

Baseline: `0a7d44794d7ad0e8cd2beafc878ab7fea5f1bbbd`.
This is a contract-reconciliation pass, not a new parallel workflow or a claim that
all production journeys have been certified. No database migration is introduced.

## Connected paths

| Boundary | Shared contract and enforcement |
| --- | --- |
| Orders -> lists/boards/badges -> app calendar | `src/lib/order/status-semantics.ts` defines read-side aliases and terminal/cancelled classification. The badge catalog re-exports its existing public helper. The calendar imports the same implementation. Actual status/permission transition guards are unchanged. |
| Trusted server event -> in-app inbox -> Telegram outbox | Existing `publishNotifications` and its atomic publication RPC remain authoritative. An uncertain RPC result falls back with the SAME generated IDs and ignore-on-conflict semantics. A known missing migration still uses ordinary inserts and stops repeated unsupported RPC calls for that fanout. |
| HTTP inbox -> realtime/UI model | `notificationApiRecord` projects canonical owner, category, read state, source, relative link and timestamps. Existing camel-case HTTP aliases remain. HTTP consumers can normalize the response with the same `normalizeNotification` function as realtime rows. |
| Personal preference API -> delivery eligibility | Preferences are rows keyed by `(user_id, notification_type)`, not one email configuration record per user. Both GET and PATCH address the active authenticated account. Existing Telegram SQL evaluates the same per-type rows alongside company and personal category controls. |
| Telegram /ask -> shared OpenRouter client | One response-language policy with Toolkit; numeric priorities survive field allowlisting. Tool declarations remain available to interpret earlier tool results, while the final bounded round uses `tool_choice: none`. The client still defaults ordinary tool callers to `auto`. |
| Canvas model output -> persisted proposals -> reviewed editor operation | Missing revision fields remain absent through JSON persistence and execution. Explicit empty strings clear text intentionally. Invalid supplied scenes fail closed, rather than degrading into the intentional context-free saved-proposal parser. Existing locked/stale/page/parent checks and batch undo boundaries remain. |

## Notification API contract

`GET /api/notifications?unreadOnly=true&limit=50` returns the same list-shaped response
as before, including `id`, `type`, `title`, `message`, `link`, `isRead`, `sourceType`,
`sourceId`, `createdAt`, `readAt`. It additionally includes canonical fields including
`user_id`, `notification_type`, `is_read`, `is_dismissed`, `source_type`, `source_id`,
`created_at`, `read_at`, plus the UI projection's category/read/reference fields.
There is one authoritative read value; aliases cannot disagree.

Authentication failures are no longer successful empty inboxes. All responses are
private/no-store. Limits must be integers in 1..200. Database failures return a safe
unavailable response instead of success or provider/database details.

`POST /api/notifications` is an untrusted client-created in-app note, not a broadcast
or Telegram publisher. Its owner is always the active session user. A supplied
`userId` is accepted only when it matches that account. Other owners return 403.
Only known fields, bounded text, valid type/source identifiers, optional UUID source
IDs and safe application-relative links are accepted. Trusted business-event fanout
continues to use the server publisher, not this endpoint.

`PUT /api/notifications` accepts either `{ "markAllRead": true }` or a nonempty
`{ "ids": ["notification UUID"] }` list of at most 200 IDs. Ambiguous combinations
and invalid fields are rejected. Writes are owner-scoped and only change unread,
undismissed records; an earlier read timestamp is not overwritten on replay.

`DELETE /api/notifications?id=<UUID>` dismisses only the current account's record.
Without an ID it dismisses only that account's already-read records.

## Preference correction

`GET /api/notifications/preferences` returns:

```json
{"data":[{"notification_type":"order_confirmed","enabled":false}]}
```

No rows means the existing default policy applies. GET never creates database rows.
PATCH accepts one `{ "notification_type": "order_confirmed", "enabled": false }`
or `{ "preferences": [ ... ] }` containing 1..100 unique per-type entries.
The owner is server-derived; arbitrary user IDs, columns and duplicate types are
rejected. Upsert uses `user_id,notification_type`, and does not write the nonexistent
`updated_at` field from the old endpoint.

This deliberately replaces the old email-shaped preference response/write contract.
The repository search found no app consumer of that old email-shaped endpoint. Any
external client must adopt the per-type format above. These are per-type preferences,
not replacements for Telegram-specific categories, preview mode or AI consent.

## Preserved boundaries

Telegram account linking, personal consent, role checks, receiver leases, private
long polling, command replay fencing and post-inference authorization are not weakened.
OpenRouter tools remain read-only in Telegram. This pass does not add a generic
cross-account service-role tool or autonomous order/canvas writes.

Lifecycle aliases are presentation/read projections, never permission to confirm,
load, cancel or dispatch an order. Original profile/order forms are unchanged.
Canvas changes still require the existing user review/application workflow; this pass
does not add duplicate controls, alter shared/private conversation ownership, or
change media fetching policy.

The RPC fallback protects against duplicate in-app rows during the same publication
attempt. It is NOT exactly-once Telegram delivery or a durable retry of the entire
business event. No duplicate-send guarantee is newly claimed.

## Executed verification

52 focused tests passed against the pinned production modules and changed code:
21 notification/preference/calendar/badge contracts, 8 Telegram/OpenRouter contracts,
11 Canvas normalization/persistence/executor contracts, 4 trusted-publication handoff
checks and 8 request/account boundary checks. No failures or skipped tests.
The new defect tests were observed failing before their corresponding fixes.

Strict TypeScript checking passed for dependency-free status, notification projection,
active-account/body-reader, Telegram assistant/language and Canvas action/executor
modules with their actual local dependencies. TypeScript syntax checks covered every
materialized source/test module. `git diff --check` passed.

The container could not clone GitHub or obtain application dependencies. Source was
read at the pinned commit through the connector and checked against Git blob hashes.
Focused execution used real TypeScript-transpiled modules, Node test/assert, and
controlled database/editor/provider boundaries. The local harness supplied only
framework response/error helpers and inert provider configuration. This is NOT a
full SvelteKit runtime, real Supabase, native tldraw browser, or live provider test.

In a full checkout, the added tests use the repository's existing test interface:

```sh
node packages/vitest/bin.js tests/unit/system-workflow-contracts.test.ts \
  tests/unit/system-ai-contracts.test.ts tests/unit/system-canvas-contracts.test.ts \
  tests/unit/system-notification-handoff.test.ts tests/unit/system-request-boundaries.test.ts
npm run test
npm run test:unit
npm run check
npm run build
```

Full repository suites, Svelte compilation, production build, native browser testing,
SQL execution and live Telegram/OpenRouter calls were NOT run here. No production
deployment, migration or bot configuration was performed.

## Remaining integration debt and deployment checks

The legacy iCal export/subscription service in
`src/lib/server/calendar/CalendarService.ts` remains a separate projection. The audit
found that its order feed excludes only `COMPLETED`, uses `BASE_URL` directly, and its
loading feed uses event links rather than the full assignment union used by the app
calendar. These paths are NOT fixed or covered by this pass. Reconcile their query,
subscription authorization, civil-date/timezone and URL contracts before treating
external calendar feeds as equivalent to the in-app calendar. The station export's
heuristic schedule also needs explicit treatment as an estimate, not a real deadline.

On staging, verify the changed inbox/preferences endpoints with two accounts, including
inactive accounts, own read/dismiss, cross-user IDs and cache behavior. Confirm a per-type
opt-out blocks the next eligible phone delivery and does not subscribe to another user's
feed. Verify all earlier Telegram migrations are present before testing its functionality.

Compare cancellation/terminal badges with calendar counts using legacy status spellings
and legacy-only badges. For AI, request a two-step order lookup in each account language;
confirm it ends in an answer without an extra lookup. On Canvas, approve a body-only
revision, save/reopen its proposal, test stale/locked rejection and native Undo/Redo.
No end-to-end journey should be marked production-verified solely from these unit fixtures.
