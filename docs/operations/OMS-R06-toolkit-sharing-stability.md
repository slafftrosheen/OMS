# OMS-R06 — Shared Toolkit documents, private discussions and stable editing

**Release status:** committed source and SQL, **not applied to production**. This batch requires one NEW, unapplied migration `20261009000005_toolkit_shared_canvases_private_conversations.sql`; it must be applied before installing this application version. Older R01/R02 migrations are also pending.

## Definitive sharing rules

- **RD (R&D), Boss, HeadOfProduction:** can list, create, open, edit, rename, and delete **every Toolkit canvas**, regardless of who originally created it. All existing projects become shared; every new project is shared automatically.
- **StationHead, Operator, anonymous:** no access to Toolkit project records. Enforced by authenticated API checks **and database RLS policies**. No trusting client-provided roles.
- **Conversations:** each user's Toolkit canvas discussion and pending suggestions are private to that user's account, even when both users open the same team board. Standalone Toolkit Conversations continue using the existing `ai_chat_sessions`/`ai_chat_messages` owner-only policies; R06 does not alter their contents or RLS.
- **Deletion** is allowed for all three management roles and is permanent for the entire team; private associated discussions are cascade-deleted with the project.

### Private-content migration, critical

R05 mistakenly stored `conversation` and `proposals` in shared `canvas_documents.payload`. R06's transaction:

1. Adds `toolkit_canvas_conversations(canvas_id,user_id,messages,proposals)`.
2. Copies each legacy project creator's R05 private discussion/suggestions to a private row, if `user_id` is available. Also extracts historical embedded ChatShape conversations into the private `node_threads` archive for that creator, visible in the Brainstorm panel's archive drawer.
3. Removes those properties from the shared document payload **and empties embedded ChatShape `props.messages` arrays**. Database insert/update triggers enforce the same stripping for future shared snapshots, including direct PostgREST clients.
4. Marks all projects shared, replaces old owner policies with explicit manager-only RLS, and enforces new owner-only RLS on discussions.
5. Adds an integer revision counter and a trigger that advances it on every shared-document update.

These steps are in **one SQL transaction**: sharing is not enabled before private history is scrubbed. Legacy ChatShape nodes remain visible as empty visual elements, but their historic messages live only in their original owner's private archive. Project documents lacking an owner cannot have a private discussion attributed automatically; archive/inspect such records separately if present.

### Conflict prevention and recovery

Shared boards are **asynchronous collaboration**, not simultaneous cursor coediting. Opening the project fetches the server's `revision`. Save uses an atomic `UPDATE WHERE revision = expected`; Postgres increments revision on success. A stale tab receives **HTTP 409**.

On a conflict, autosave **stops** instead of overwriting another person's edits. The screen keeps the unsaved local canvas and offers **Save a copy** or **Reload latest**. The app checks for another team's save every 45 seconds while idle and on focus and offers reload. Private discussions save independently, not with the shared canvas.

A failed network save leaves local changes dirty, and explicit board switching requires successful save. The before-unload warning protects navigation; do not assume a network save can finish reliably after tab close.

### Visual media and art tools

R06 also introduces a PRIVATE `toolkit-assets` Supabase Storage bucket, `toolkit_assets` metadata/RLS, authenticated project asset upload/download APIs, a browser PDF.js preview, PNG/JPEG/WebP/GIF imports, quick canvas pen/highlight/shapes/text/eraser controls and material surface studies. See [the visual assets acceptance checklist](OMS-R06-toolkit-visual-assets.md). This is part of the **same** migration and app deployment gate.

Legacy interactive ChatShape nodes are **read-only inside shared Toolkit boards** because their old implementation persisted messages in shape properties. Their original messages are kept in each owner's private archive; order-specific canvas behavior remains unchanged.

### Interaction changes

- Undo, Redo, Fit to content, Delete selected, visible team-sharing notice, clearer drag affordance and drawing-tool mode selection
- Card editing stops canvas-global key shortcuts while typing
- Note/document cards have editable title and body text
- Assistant follow-ups include the current user's recent conversation and current board context; they do **not** load another user's history
- Existing advanced engineering shapes and order-form canvas shape registrations are preserved

## Deployment prerequisites

1. Preserve the private server `.env` before pulling historic R00 changes.
2. **Back up PostgreSQL 17**, and test R01 then R02 migrations `20261009000000..00004` in a disposable staging copy; resolve dependencies/role grants and verify they are installed. Do not blindly push unrelated pending migrations.
3. Inspect the actual existing `canvas_documents` table/RLS and `public.is_admin()` definition in staging; compare migration assumptions against production before applying.
4. Apply and inspect `20261009000005_toolkit_shared_canvases_private_conversations.sql` transactionally in staging. Confirm migrated legacy payload no longer contains `conversation` or `proposals` and that its associated owner's private row exists.
5. Run `npm ci`, `npm run test`, `npm run check`, `npm run build` (plus browser tests) on the candidate. Type check the tldraw/React integrations and fix any actual tool/compiler failures before release.
6. Deploy the application **after** verified migrations; do not restart Supabase unnecessarily. Perform a manual regression smoke check and inspect OMS service logs.

## Cross-account acceptance script

Using test users RD-A, Boss-B, HeadOfProduction-C, StationHead-D and Operator-E:

- RD-A creates a project with an idea, note, line connection and confidential personal brainstorming history.
- Boss-B and HeadOfProduction-C see exactly the same project and can edit/save it; each sees only **their own** separate assistant history. RD-A can see new board edits after reload, but not B/C's private chat.
- StationHead-D and Operator-E get 403 for board list, create, GET, PATCH, DELETE and private discussion endpoints; anon gets 401.
- Attempt direct Supabase/PostgREST reads and writes as each role to verify that the SQL policies, not just routes, enforce the same contract.
- Open one board in A and B concurrently; B saves. When A saves against the stale revision, assert 409, no overwrite, a recovery-copy path and the ability to review the latest version.
- Verify old R05 owner conversations and pending suggestions are backfilled privately, then scrubbed from shared `canvas_documents.payload`.
- Repeated autosaves: verify latest keystrokes persist, no snapshot/document re-initialization on edit, and switching projects after network failure does not silently discard local work.
- Test undo/redo, card dragging, direct note editing, selection deletion, arrows and 360px/tablet/desktop layouts; verify order edit canvas separately.
- Simulate provider unavailable: private chat shows error and team canvas remains usable.
- Confirm deleting a shared project removes it for all managers and cascades its private conversation rows.

## Known limitations

No live Supabase migration, browser session, OpenRouter inference, or npm build was executed through the GitHub-only connector. This is not live verified. Revision-based CAS prevents silent **shared-board overwrites**, but does not merge simultaneous canvas edits. Concurrent edits to the same user's private conversation in two tabs are still last-write-wins, and real-time cursors are not implemented. Migrated legacy chats are private to their original document owner. A new collaboration merge engine would be a separate feature.
