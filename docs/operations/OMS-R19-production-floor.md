# OMS-R19 — Operator progress and versioned station edits

Implementation on top of R18. **No SQL migration** in this batch. The R02 atomic completion RPC remains required. This pass does not alter stock from progress logs.

## Station edits

`PATCH /api/orders/:id/stages?station=...` now requires `expectedUpdatedAt` (full timestamp from a fresh stage read) and performs a conditional update of both `state` and `updated_at`. Missing versions return 428; stale writes or invalid transitions return 409. All known callers (operator station board, order overview, order detail store) send the token. A resumed stage keeps its original start time. The timestamp validator accepts RFC3339 timestamps returned by Supabase, including fractional seconds and timezone offsets. Completed stages cannot be modified with generic PATCH.

## Operator updates

`GET|POST /api/station/:station/orders/:id/progress` loads 20 recent progress entries and appends an authenticated station log using the existing `create_station_log` RPC. POST checks current access, role assignment, in-progress stage, and its revision, then fixes the log action server-side to `PROGRESS_UPDATE`. Progress is 0–99% and/or an up-to-1000-character note; 100% requires the separate completion path. The workstation modal retains entered text after failure and shows recent persisted records. There is no new mutable progress column.

## Completion and handoff

The completion dialog now supplies optional actual hours and notes. The endpoint validates bounded hours/notes, unique items and proper skip declarations before invoking existing `complete_stage_with_consumption`. It preserves the atomic stock deduction and next-station queue transaction, then displays a next-station handoff message. EN/RU/LV coverage is included.

## Validate before release

- Run `npm ci`, `npm run check`, `npx vitest run tests/unit/oms-r19-production-floor.test.ts`, and `npm run build`.
- Two simultaneous operator views: start, block, resume, note-edit, and verify stale edits get 409 and do not erase the latest record.
- Progress report 35% and note. Refresh, verify history persistence; 100% must reject and not deduct stock. Test unauthorized operator and completed order.
- Complete with 2 material lines and 1.25 hours; assert exact inventory movements and next station queued. Retry once and confirm 409/no second deduction. Test skip reason and notification.
- Simulate network loss during progress submission; check history before retry. The existing `create_station_log` RPC is not idempotent, and progress submit is not transactionally bound to stage completion: concurrent handoff may allow a late progress note. **Do not mistake this append-only log for an exactly-once production operation.**
- Other historical clients not updated to send `expectedUpdatedAt` will receive 428 and must be migrated before deployment.

This change was authored through the GitHub connector; no live database/browser, Svelte compiler, or migration was executed.
