# Client lifecycle and legacy-code cleanup

## Scope and removal evidence

The reviewed removal set contains 62 files. The unused `csv-writer`, `jsbarcode`,
`@types/jsbarcode`, `apexcharts` and `svelte-apexcharts` declarations and lock
records are removed. Retained dependency versions and lock records are unchanged.

This pass removes modules whose import closure is unreachable from current route,
application and test entry points. Static imports, re-exports, literal dynamic
imports, aliases and script/package references were checked before removal.
Historical order forms, file widgets, calendar/presence components and local chart
stubs are recoverable through git history; they are not alternative runtime entry
points. The active order forms and persisted canvas shape registrations remain.

The `/ai-lab`, `/ai-lab/chat` and `/ai-lab/canvas` aliases retain their existing
server redirects to Toolkit. Their unreachable client implementations are removed.
The obsolete WebSocket store, its proxy/configuration and the empty `/api/updates`
poll endpoint are removed; current Supabase realtime remains available.

## Session and request ownership

- Importing or constructing auth state does not make a request. The root layout
  starts one explicit session check and provides the same instance through context
  and the compatibility store. Concurrent checks share a promise. Timeouts abort
  the fetch, and login/logout invalidates older responses.
- Logout checks its revision after loading cleanup code, so it cannot issue a
  delayed session deletion after a newer sign-in.
- Order lists load when their route requests them. The shell no longer fetches a
  complete list on settings, dashboard or canvas visits.
- The chat drawer mounts on demand. The shell owns the chat subscription, while
  room, message and directory reads share concurrent requests. Account changes
  clear these stores and abort their pending work.
- Chat history refreshes retain realtime arrivals and pending optimistic sends.
  A send acknowledgement replaces any earlier realtime echo. New rooms appear
  only after a successful server response, and direct messages use their existing
  creation endpoint once. Dialog and station startup continuations stop when
  their view or account is no longer current.
- Dashboard orders, KPIs and trends start together. Each panel retains its own
  failure result; unavailable metrics remain distinct from verified zero values.
- Notification bell/page consumers share their initial read and channel. Clearing
  displayed read items uses one owner-scoped write, and a newer arrival is kept.
  See [Telegram operations](telegram-notifications.md) for provider request details.

## Appearance preferences

`ui` is the canonical theme, density and font-scale store. The older theme API is
an adapter, including the `HighContrast` to `HighContrastVim` compatibility mapping.
All controls share one authenticated preference read and one debounced partial
write queue. Explicit URL/control choices take precedence over a late server read.
Account changes cancel queued writes and invalidate pending responses.

The obsolete second `/api/settings` write path is removed from the client. Query
preferences are applied in the browser rather than mutating server module state.

## Canvas and Toolkit

- The Svelte/React bridge forwards current order seeds and callbacks into the
  existing editor. The initial snapshot remains a mount seed, preserving editor
  identity, selection and undo history during form edits. Restored snapshots are
  detached from Svelte state proxies before tldraw freezes their records.
- Shared Toolkit document snapshots are captured on save/recovery rather than
  serializing the entire document on every intermediate drag update. Private
  camera/selection and conversations stay outside the shared document payload.
- Technical node buttons and the toolbar share one runner. Concurrent runs of
  the same node reuse the pending operation. Result updates patch only execution
  fields, preserving edits made during a request and skipping deleted nodes.
- Project brief export and local audits read card/link data without constructing
  an AI scene capture.
- Toolkit chat responses belong to their session and component lifetime, so a
  delayed request cannot replace another conversation after navigation.

## Verification

Focused unit tests cover request sharing, cancellation, stale account responses,
dashboard partial failures, notification mutations and canvas runner concurrency.
Browser fixtures mount the actual app shell and native canvas editor, including
live and restored order snapshots. API/provider responses are controlled fixtures;
these checks do not send Telegram messages or consume OpenRouter credits.

Results recorded on 22 October 2026:

| Check | Result |
| --- | --- |
| `npm run test:unit` | 571 passed, 0 failed |
| `npm test` | 110 passed, 0 failed |
| `npm run check` | 0 errors; 266 warnings in 75 files |
| UI Playwright scenarios | All 50 verified: 49 in the full run, then the corrected restore scenario passed on targeted rerun |
| `npm run build` | Production build and Node adapter completed successfully |
| `git diff --check` | Passed |

The restore regression found the Svelte proxy/freezing boundary described above.
Its final run also verifies subsequent form updates, preserved shape IDs and
profile data, current callbacks and cleanup of the previous editor bridge. The
asynchronous remount uses the same startup allowance as initial editor loading.

Warnings decreased from 315 to 266; the remaining diagnostic backlog is not
eliminated by this pass. This pass introduces no database migration.
