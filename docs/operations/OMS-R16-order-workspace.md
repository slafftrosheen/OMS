# OMS-R16 — Consolidated Order Workspace

**Committed to `main`.** A UI/contract consolidation on top of R12–R15. No SQL migration for R16.

## Objectives

Replace the old nine squeezed editor tabs and duplicate upload paths with a coherent, task-based order workflow. Keep Canvas available without forcing users to work inside a narrow 280px docker when checking order details, production readiness or document revisions.

The actual order remains the same canonical `draft_orders.id`; existing role restrictions and production-stage API constraints continue to apply. Selecting a workspace section **never changes order status or grants permissions**.

## User navigation

The order editor (`/orders/{uuid}/edit`) now has four task groups with nested sections:

| Group | Sections |
|---|---|
| Prepare | Details & profiles, Attachments, AI intake |
| Plan production | Production readiness, Canvas & zones |
| Review changes | File revisions, Approvals |
| Collaborate | Assistant chat |

Opening a section updates `?section=` via SvelteKit shallow navigation, so links from the main order overview open the same view in the editor. An unrecognized section defaults to Details rather than constructing arbitrary links.

The default working layout is a **wide focus panel** with responsive forms, a dedicated section heading, and a clearly labeled option to reveal the Canvas. Selecting Canvas & zones automatically exposes the tldraw drawing. At narrower widths the workflow buttons horizontally scroll; Canvas mode retains a compact floating management panel.

The order overview includes direct actions for the most common workspace sections and a status-based **Continue workflow** shortcut. The shortcut never automatically writes an order or bypasses existing server role checks.

## Order data and save behavior

- The editor marks form edits dirty using a fingerprint of the actual saveable fields and all four profile quantities, not only the previously used Canvas-dirty flag.
- It warns before SvelteKit navigation away or browser unload when there are unsaved form or Canvas edits. Following a successful authorized PUT and Canvas save it resets the saved-state marker.
- The Save Draft action remains explicit. AI-intake proposals are still local until individually accepted and then saved via the existing transactional draft API.
- The file-count badge comes from an authenticated `/api/files` list and updates after successful uploads/deletions in the shared OrderFiles component. Counts are bounded by 100 listed attachments; it is **not an exact unlimited total**.

## One attachment workflow

Both main order overview and editor now use `src/lib/order/OrderFiles.svelte`. The old overview-only `FileUpload` + `FileList` pairing is removed from the overview route, so uploads and deletions use one request-scoped private-Storage API contract.

All mutations continue to be role and lifecycle checked on the server. Hiding a button is only UX; the API remains authoritative. Referenced R15 revision-evidence attachments remain protected against deletion.

## Actual production stages

R16 fixes a visible regression on the order overview: `order_stages` is an **array** of rows with `station` and `state`, not an object map. Progress now calculates `COMPLETED` or `SKIPPED` rows out of all valid stages. With no stages it shows **0%**, never NaN.

The stage controls render actual station names/states. Controls are shown only where the user role/station assignment could operate that station; the server still checks permissions and legal transitions. Blocking a stage requires an explicit reason. The overview no longer offers COMPLETED or SKIPPED states because the backend requires the material-consumption completion and other dedicated endpoints.

## Approvals and change requests

The editor's Approvals section now uses actual `change_requests.status='pending'` records. It displays persisted `proposed_diff` and review notes, and lets authorized management record approval/rejection through the **review-only** endpoint:

`POST /api/change-requests/{id}/review`

This does not call the legacy approve-and-apply endpoint and does not automatically mutate the order. Revision Intelligence retains its own source-file hash and audit relationship. Review permissions are enforced by the R15 hardened SQL migration.

## Translations

All new workspace flow, section names, warning dialogs, stage prompts and approval text are fully localized in EN/RU/LV, with parity checks included in the R16 regression test.

## Test and deploy

```bash
npm run check
npx vitest run tests/unit/oms-r16-order-workspace.test.ts
npx vitest run tests/unit/oms-r15-revision-intelligence.test.ts tests/unit/oms-r14-production-readiness.test.ts
npm run build
```

Manual browser acceptance:

1. From an existing order overview, open Details, Files, AI Intake, Readiness and Revisions; confirm each deep link selects the correct section. Use back/forward navigation and open direct links in new tabs.
2. Enter dirty client/title/date/profile-quantity edits; attempt to navigate away and refresh. Check warning, cancel, save and repeat. Verify all values round-trip on reload.
3. Check wide focus layout on desktop and mobile. Toggle Show Canvas, select drawing shapes and return to Details without losing canvas state; test with a preexisting large drawing.
4. Upload PNG/PDF/DXF/CDR from the overview, refresh the editor and verify the same order attachments. Test deleting a referenced revision-evidence file (expected 409).
5. Validate read-only file controls on archived/dispatched orders and non-manager accounts. Check backend 403 for unauthorized writes.
6. Use an order with stages in QUEUED, IN_PROGRESS, BLOCKED, COMPLETED; verify meaningful stage names and percentage. Blocking requires a reason. A COMPLETED action belongs in the dedicated station material-consumption flow, not a free-form select.
7. Load a pending R15 revision change request. Confirm its proposed diff is visible in Approvals, approve as Boss/HoP/RD, and check change-request history updates **without updating order fields**. Unprivileged users must not see active review controls.
8. Confirm EN, LV, RU labels on desktop and mobile. Ensure date, language and PO numbering remain unchanged.

R16 introduces **no new migration**, but the existing R12 atomic draft form migration and R15 privileged change-request hardening migration must already be deployed and accepted.

**Not yet verified in production:** no actual SvelteKit build, browser navigation, order mutation, Supabase migration or end-to-end attachment round-trip was executed from this GitHub-only editing session. This source audit does not replace live acceptance.
