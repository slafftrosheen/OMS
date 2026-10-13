# OMS-R07 — Canvas upload fix and expanded assistant

**Status:** Source commit only. Not deployed; not verified against the live self-hosted Supabase or proxy.

## Upload diagnosis from the October 13 browser console

The user log contains an **ERR_CONNECTION_RESET** while POSTing to
`/api/toolkit/assets/{board UUID}`. There is no response body or server-side
trace, so the precise crashing hop remains unknown. The R06 upload accepted
25 MiB, but **SvelteKit adapter-node defaults to a 512 KiB body limit**.
The previous `.env.example` used `BODY_LIMIT=25M`, which adapter-node does
**not** read. This is a concrete configuration mismatch and the highest-
probability explanation. The app now checks the configured upload ceiling in
an authenticated GET before sending bytes and explains a missing setting.

### Deploy prerequisites — do not skip

1. Confirm the previous **R06 migration** `20261009000005_toolkit_shared_canvases_private_conversations.sql` has been applied and the private `toolkit-assets` Storage bucket, `toolkit_assets` table and policies are present. Older pending R01/R02 migrations must also have been reviewed in sequence. Preserve DB/backups.
2. On the server running `reclame-oms.service`, set `BODY_SIZE_LIMIT=32M`
   in its actual loaded environment file (do not set only `BODY_LIMIT`).
   See `sudo systemctl cat reclame-oms.service` to determine which
   `EnvironmentFile` or override is used.
3. If Nginx fronts the app, set `client_max_body_size 32m;` on the
   **actual deployed** server/location (the repository `nginx.conf` may
   belong to an older Docker deployment). Check Cloudflare/other proxy caps
   as applicable. Reload the proxy after validating configuration.
4. Rebuild/redeploy and `sudo systemctl restart reclame-oms.service`.
   Verify the running process has `BODY_SIZE_LIMIT` in its environment,
   not just that `.env` was edited. Use your systemd unit's configuration
   rather than reading or sharing secrets.
5. In a logged-in Toolkit project, an authenticated
   `GET /api/toolkit/assets/{board UUID}` should now return
   `{"ready":true,...}`; with missing configuration it returns HTTP 503
   with a clear explanation.
6. Upload 100 KB PNG, 1 MB JPEG, 10 MB PDF and 24 MB PDF. Confirm Storage
   metadata row, document preview, save and reload. If the request still
   resets, inspect `journalctl -u reclame-oms.service` and the proxy
   access/error logs during the exact upload. Do not claim R07 fixes a
   network/proxy/service crash without that evidence.

Files are never public. R&D, Boss and HeadOfProduction share canvas documents
and files; brainstorming history and proposed changes remain user-private.
The upload validation still checks maximum 25 MiB, MIME, file signature,
board access and Storage ownership. Empty browser MIME is resolved by an
allowlisted extension, but must pass magic-byte verification.

## Snapshot and clipboard stability

Replaced the deprecated `editor.store.getSnapshot()` calls with tldraw's
`getSnapshot(editor.store)`. Document change events still mark the board
dirty immediately; snapshot serialization is coalesced for 250 ms. Saving
flushes the current document synchronously before sending the revision-
protected PATCH. Only tldraw **document** records are saved on shared
boards; camera/selection session is not synced to other managers.

The client's clipboard exception (`navigator.clipboard.writeText` undefined)
is likely due to a non-secure HTTP origin where modern browsers restrict
the Clipboard API. Toolkit displays a warning; run the app under a trusted
HTTPS origin to restore native clipboard behavior. The app does not monkey
patch browser clipboard security.

The unrelated analytics `/api/analytics?type=trends&period=30` 500
and missing Sentry DSN are not part of this release.

## Assistant skills and tools

Eight explicitly selected skills:

- Expand ideas — alternatives, variations and opportunity discovery
- Challenge — assumptions, risks and missing evidence
- Plan project — milestones, tasks, dependency paths
- Compare — decision criteria and tradeoffs
- Find relationships — missing arrows between existing cards
- Organize board — grid/column layout proposals
- Research web — read-only SearXNG search, returns clickable source links;
  failure is visible and no sources are fabricated
- Summarize — brief and next-step recap

A **local Board audit** button also works without a provider call: it summarizes
the number of cards/connections, open tasks, isolated ideas, missing details and
whether a decision card exists.

The assistant receives bounded cards, directed links, read-only statistics
(orphans, unfinished tasks, missing details) and lightweight image/PDF
**metadata**, not raw document binary or private supplier credentials.
It does NOT read PDF text or image pixels yet; don't claim that it does.

The provider can propose up to five new idea cards and three explicit
actions: **connect two existing idea nodes** (native bound arrow),
**revise an existing idea node**, or **arrange idea cards** as a grid or
kind-grouped columns. Actions are validated against current shape IDs,
saved in the current user's private conversation proposal list, and are
NEVER executed until the user presses Review & apply. Layout asks for
additional confirmation, does not reposition imported media/technical
shapes, and a stale shared revision blocks approval pending reload.

## Acceptance

- Verify eight skills work against a board with ideas/tasks/decisions and
  with empty board; invalid IDs and unknown actions are discarded
- Refresh with unapproved actions; the same user sees them, second
  manager does not
- Connect two cards and move either one: arrow remains bound
- Edit a card through a proposal, confirm undo and save/reopen
- Rearrange idea cards, confirm imported PDF/image and technical shapes
  remain unmoved
- Test Search skill with working and unavailable SearXNG, and confirm
  correct citation links and explicit failure
- Try rapid drag, type, Save immediately and reopen; confirm no data loss,
  no deprecated snapshot warnings and no R06 conflict regression
- Run `npm ci && npm run test && npm run check && npm run build` and browser
  staging acceptance before deployment. These were NOT executed in the
  GitHub-only session.

**Limitations:** This is not autonomous editing, real-time collaborative
merging, vector search over PDF contents or image understanding. References
from the search backend are read-only and must be verified before production
engineering decisions.
