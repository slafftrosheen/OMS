# UI cleanup and interaction stability

## Scope

This pass follows the canvas and OpenRouter workflow changes and addresses the
remaining Svelte diagnostics, obsolete UI code, and defects discovered while
checking the affected interactions. It preserves native order profile payloads,
inventory adjustment rules, station permissions, and the existing server APIs.

## Dialog and keyboard behavior

`src/lib/ui/modal-dialog.ts` is the shared action for native modal dialogs.
The browser makes the background inert and restores focus when the dialog
closes. A local Tab boundary cycles through the top dialog's current visible,
enabled controls in both directions. Nested dialogs share a reference-counted
body scroll lock.
A dialog destroyed before its opening microtask cannot open or steal focus.
Escape and backdrop dismissal use the current options, so callers can refuse
dismissal while a write is pending.

The shared Modal adapters, calendar editor and picker, chat drawer and nested
dialogs, order review and edit dialogs, inventory reconciliation/replenishment,
station dialogs, and search use this behavior. The topbar chat popover remains
nonmodal and supports explicit keyboard dismissal.

Station progress now shares its saving state with the containing dialog.
The dismissal lock ends after the write is acknowledged, while history refreshes
independently. A delayed history read cannot trap the operator in a saved dialog;
changing the target or closing the panel aborts that read.
Order confirmation, rejection, block, rework, and resolution fields remain fixed
while their request is pending. A rejected write leaves the relevant dialog and
draft available for correction or retry.

`src/lib/a11y/scroll-region.ts` gives named table regions a keyboard tab stop only
while they overflow. Resize and content observers keep this accurate when the
viewport, rows, or content changes; teardown removes those observers.

## Form controls and calendar components

Labels target stable component IDs. Actual groups of controls use fieldsets and
legends. Color pickers have separate selection and clearing buttons, avoiding
invalid nested buttons. Their mode, search, selected preview, and parent reset
behavior are reactive. Existing order fields, validation, serialized profile
configuration, and inventory metadata boundaries are retained.

ORACAL labels and selected previews choose black or white text using the actual
swatch's relative luminance. The editable code field retains that swatch as its
background even while focused. Browser checks cover all 38 catalog colors and
the light, dark, and high-contrast themes.

Calendar editor drafts reset when the event identity changes and survive a
refresh of the same event. Saving uses the draft's event identity. Month-grid
focus belongs to its own instance and remains reachable after changing from a
longer to a shorter month. Loading-picker navigation and dismissal are reactive.
These retained shared calendar components have dedicated browser fixtures; the
live calendar's existing day-badge calculations are unchanged.

## Chat and search contracts

The order composer now sends the existing API's required `text` field. Previously
it sent `message`, which the endpoint rejected. Successful responses are parsed
and deduplicated; confirmed local sends, edits, and deletions survive an older
history response. Requests and publication belong to one order and account.
Changing either aborts outstanding work and invalidates obsolete responses.

Failed sends and edits preserve their drafts. Composition Enter does not submit,
message actions are keyboard accessible, and selecting the same attachment again
works. A late send acknowledgement cannot clear a newly chosen reply target.
Chat drawer text and explicit mention recipients are retained per room. New chat
labels are provided in English, Russian, and Latvian.

Global search consumes the endpoint's existing `results`, `href`, and `subtitle`
fields. It no longer requires the absent `success` flag or calls the nonexistent
suggestions endpoint. Query, dialog, and account changes invalidate old results
and outstanding requests. Failed search requests have a visible recovery state.

## Scanner, PDF, and async resources

The station scanner opens one scanner dialog and consumes its validated order
payload. Scanning identifies an order and navigates to it; starting a stage
remains an explicit operation. Scanner teardown stops media tracks, including
streams acquired after the dialog closes. Decoding and validation do not overlap,
and validation has a deadline and retry state.

PDF state is reactive. Document changes destroy obsolete loading tasks and
workers; page and zoom changes cancel and serialize canvas rendering. Late
document/page work cannot paint over the current document. Browser preference
and annotation storage failures do not crash the viewer.

Annotation controls remain mounted but hidden and inert until the requested
document, page, and zoom have painted successfully. A pending or failed page
change cannot save a note against the wrong visible page, and zooming does not
discard an unsaved draft when browser storage writes are unavailable.

Annotations are scoped to order reference, revision, and page. Existing first-page
storage keys remain compatible. Stored arrays, coordinates, and text are checked
before rendering. Existing valid annotation arrays, long notes, and rectangle
geometry are retained without truncation; limits apply to new additions and
input. Annotation creation is available by keyboard as well as pointer.

Attachment galleries perform one initial read, discard responses from an old
order or filter, and navigate only between image attachments. The preview places
image navigation and file details in separate layout rows so metadata cannot
cover the controls. Desktop and phone checks exercise both navigation and the
download link. Closing an export cancels its pending download.

## Removal evidence

The five unused files under `src/lib/admin/components/builder/` were removed after
checking references, imports, re-exports, and glob entry points. They only
referenced one another and had no current application or test consumers. They
are recoverable through git history.

Unused scoped CSS was removed from affected analytics, profile, inventory, order,
production, and support views. Live child-component styles were scoped correctly
instead of being discarded. The obsolete search suggestions request and UI were
removed together. No dependency version or database schema changes are included.

## Verification boundaries

Browser fixtures mount real components and routes with controlled API responses.
They cover failed and delayed requests, order/account changes, nested focus,
keyboard controls, responsive overflow, and PDF/media lifecycle behavior. No
Telegram message, paid AI request, production data mutation, or deployment is
required by these checks. Aborting a request prevents stale UI publication; it
does not revoke a write already received by the server.

## Verification record — 2026-10-22

| Check | Result |
| --- | --- |
| Svelte/TypeScript diagnostics (`npm run check`) | 0 errors, 0 warnings; baseline was 265 warnings |
| Unit and contract suite (`node packages/vitest/bin.js tests/unit`) | 629 passed |
| Source-colocated tests (`node packages/vitest/bin.js src`) | 110 passed |
| Distinct browser regressions across focused runs | 40 passed |
| Production build and Node adapter (`npm run build`) | Passed in an identical isolated source copy |
| Whitespace/error-marker check (`git diff --check`) | Passed |

The browser coverage consists of 6 calendar/chat state cases, 5 profile-control
cases, 11 shared UI/media cases, 4 real workflow-route cases, and 14 existing
calendar, material, and canvas regressions. Failures found during the initial
runs were corrected and the affected cases rerun successfully. The station
progress case additionally holds the history refresh after a successful write
to verify that dismissal and focus restoration remain available.

Screenshots were reviewed for profile controls and ORACAL contrast, narrow table
overflow, the phone chat popover, and attachment previews at desktop and phone
widths. The browser checks use Chromium and controlled fixtures; these results
do not certify other browser engines or live provider connectivity.

The working-directory build encountered an `ENOTEMPTY` collision in generated
output shared with the existing development process. The successful production
build used an isolated directory with the same dependencies. A SHA-256 manifest
confirmed that all 1,216 source files matched the working tree; only this
verification record was updated afterward. Third-party bundler and adapter
advisories remain separate from the clean Svelte/TypeScript diagnostics.
