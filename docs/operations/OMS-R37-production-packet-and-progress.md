# OMS-R37 — Native production packet and truthful stage progress

**Status:** committed directly to GitHub `main`. Source-only application change:
no new SQL migrations, no order fields, no AI-write privileges, no GitHub
Actions/CI, no build, and no deployment performed in this batch.

## Problem addressed

Before R37, a workstation displayed an order card with stage status and a
link out to the order overview, but it did not provide the saved manufacturing
profiles or the attached customer drawings within the shop-floor interaction.
The order overview also included the `DELIVERY` stage in its generic progress
percentage, making a fully manufactured order appear incomplete until
dispatch. The blocker count and reason were not visible in the overview.

## R37 workflow

From `/station/{station}`, click **Production packet** on an order card.
A modal opens without leaving the station board, displaying only original
saved order data:

1. Fetches the authorized order at `/api/draft-orders/{id}` to obtain native
   `order_profiles` sorted by their persisted `order_index` and the saved
   order revision. This is the same form data maintained in the order editor.
2. Fetches page one from the canonical `/api/files?orderId={id}` contract,
   showing original filenames, exact total and authenticated download links.
   The component shows the first 50 entries, and directs the operator to the
   full order when more files are present. Unknown/broken file loading is an
   **error**, never silently shown as an empty drawing set.
3. Fetches current `/api/orders/{id}/stages`, verifying that the correct
   station row belongs to the selected order. It displays the latest stage
   state, block reason and station notes, not the possibly stale state captured
   on the card at the time it was clicked.
4. Shows each saved profile's original quantities/notes and active
   CNC/BENDER/FRONT/PAINTING/ASSEMBLING selections. Disabled stale options
   are omitted from the compact summary; clicking **Show original production
   form** opens the actual `Profile7stVisual` in read-only mode. Historical
   profile keys are not rewritten or cleaned.
5. Clearly calls out zero profiles or zero linked files for management follow
   up. Production data cannot be inferred from a model response or an empty
   form, and the modal contains no order/stage mutation buttons.

The packet reuses the existing RLS-protected order/files/stages read routes.
File downloads use the existing authenticated `/api/files/{id}` path. If any
required source fails, the packet clears the displayed data and asks for a
refresh, rather than leaving unverified old specs visible. It is a live
read-only view, **not** a transactional, frozen production release snapshot;
operators must refresh when collaborating on a live order.

## Progress and blockers

`stageProgressSummary` counts recorded manufacturing stage rows
(`COMPLETED`/`SKIPPED`), explicitly excluding `DELIVERY`, which is
handled after loading. It includes optional/legacy configured station rows
such as QC when they exist. The percentage represents **recorded stage
completion**, not measured physical fabrication, and is never treated as an
approval to dispatch.

The order overview now displays completed/recorded stage counts and visible
BLOCKED/REWORK totals. The stage cards display blocked/rework notices and
saved block reasons. Station cards show blocking notices only while actually
BLOCKED or in REWORK; a historical block reason must not appear on a running
stage as a current stop.

The existing stage transitions, material consumption, workflow guards, role
permissions, external PO assignment and OpenRouter consent rules have not
been modified by R37.

## Manual acceptance checklist

1. Confirm a test order with two different profiles, including inactive
   material/color controls, and attach a PDF plus drawing image. Open the
   CAD workstation and its **Production packet**.
2. Verify profile order, quantities, saved active selections and notes;
   expand **Show original production form** and compare it with the saved
   editable order form. Editing is impossible in the packet.
3. Open/download each linked drawing; confirm original filenames. Remove a
   file in an authorized parallel session, refresh the packet, and verify
   counts and links update. Force a file API error: old data must disappear.
4. Mark the stage BLOCKED and enter a reason; reopen or refresh the packet.
   The current BLOCKED state and reason must display. Resume the stage and
   refresh again: the blocker must disappear, while historical activity
   remains visible in the normal order timeline.
5. Use a different workstation with no matching saved stage row: the packet
   must reject the mismatched combination rather than displaying a foreign
   order's production details.
6. Confirm that an unauthorized/expired account cannot retrieve order
   profiles or drawings simply by guessing an ID. Check read-only roles and
   original RLS behavior in staging.
7. Complete CAD→PACKAGING on a staging order while leaving DELIVERY
   `NOT_STARTED`. Manufacturing should display 100% of recorded production
   stages and should **not** imply the order has been dispatched.
8. Set PAINT to BLOCKED, then REWORK on a different stage; verify the overview
   progress decreases appropriately and the issue totals remain visible.
9. Test desktop and narrow-screen layout, PDF downloading, reopening the
   packet repeatedly and RU/LV/EN localization.

## Verification/deployment

Added source regression coverage:
`tests/unit/oms-r37-production-packet.test.ts`.

No builds, Vitest, browser automation, real Supabase requests, SQL execution
or deployments were run during this coding pass. Before deploying, operator
should run `npm run check`, appropriate Vitest tests, then manually verify the
two-session profile/file/stage cases. R36's
`20261016000001_confirmation_handoff_guards.sql` still needs to be applied
**before deploying R36/R37 application code** if it has not yet been deployed.

GitHub is the source repository only; no CI/actions are required.
