# Canvas save, navigation and recovery

## One writer per document and private discussion

The shared canvas and the user's private discussion have separate save queues.
Concurrent callers share the active save and any follow-up write needed for edits
made while it was pending. Every canvas PATCH uses the revision confirmed by the
preceding response. This prevents two save waiters from sending the same stale
revision and producing a conflict against their own work.

A failed write leaves the relevant content dirty and shows the existing retry
control. There is no unbounded background retry loop. Internal project switching
waits for both queues; unsaved work blocks that switch when persistence fails.
App navigation warns before discarding unsaved content or an import/recovery in
progress. Native page unloads use the browser's equivalent warning.

Project loads have a generation and an abort controller. Only the most recent
navigation request may open a project after awaiting saves. An actual transition
clears the old board identity before loading the new board and private discussion.
Late metadata, file-library, link-preview or assistant results cannot mutate the
newly opened board, including an A → B → A switch. Teardown aborts page-owned reads
and inference, and clears pending autosave timers.

## Recovery copies own their files

On a shared-document revision conflict, **Save copy** calls
`POST /api/ai/canvas/:source/recover` with the captured unsaved snapshot and title.
The server validates Toolkit-manager access and reads the source board through
the signed-in user's RLS-scoped client. It resolves only file references belonging
to that source board.

Referenced Toolkit media receive new asset IDs, independent private Storage
objects and metadata rows owned by the new board. Document file IDs and URLs,
native image sources and material textures are remapped. Deleting the original
project therefore does not remove the recovery copy's Toolkit media. External
links and existing order-file references retain their original ownership and
access rules. Unreferenced saved-library files are not copied.

The copy limit is 100 referenced files and 250 MiB in total, with four Storage
copies in flight at a time. Existing per-file MIME, size and canonical storage-path
validation still applies. No new database migration is needed.

Private discussion is copied separately. If that step fails, the UI retains the
original board and retries against the already-created recovery board; it does
not create another board and another set of media. If the user edits the title,
drawing or discussion while recovery is pending, the copy remains available in
Projects and the newer edits remain open in the source project. Successful copying
never silently marks those newer edits as saved.

Storage and PostgREST cannot share a transaction. Failed server copies wait for
all attempted writes to settle, then remove only the attempted destination paths
and board row. Cleanup itself can fail during an outage; those failures are logged
and the request still reports failure. The source objects are never cleanup targets.
A response lost after successful server completion can leave a completed copy
visible in Projects on the next refresh; the operation is not globally idempotent.

## Verification

`canvas-save-queue.test.ts` checks shared save ownership, a follow-up revision,
failure/retry and teardown. `toolkit-recovery.test.ts` checks independent media
ownership and remapping, missing/cross-board references, limits, partial-copy
failures, lost write acknowledgements and compensation. These tests use controlled
database/storage responses, not a live Supabase bucket.

`tests/e2e/canvas-lifecycle.spec.ts` mounts the actual Toolkit page and tldraw with
delayed application API fixtures to exercise saves, board switching, recovery and
navigation. The new dock and linked-batch specs exercise actual native editor
behavior. Provider, Telegram and production database operations are not part of
these browser regressions.
