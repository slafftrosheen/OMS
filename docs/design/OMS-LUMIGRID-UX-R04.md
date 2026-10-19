# OMS — LUMIGRID UX R04: order workspace and production handoff

Date: 2026-10-19. Continuation of R01, R02 and R03.

## Delivered directly to `main`

### Order workflow and handheld editor

- The order workspace now uses a **non-obscuring mobile layout**. When drawing tools are visible, the canvas occupies the upper grid and the existing native-form/assistant dock occupies the lower grid. The dock no longer floats above and hides the drawing surface at 720px and below. The existing Focus/Show Canvas state remains authoritative.
- Narrow toolbars scroll instead of clipping the save/confirm controls. Form fields and the dock have independent scrolling; keyboard focus remains visible. The drawing canvas and native data contracts are unchanged.
- Main order editor labels, actions, priorities, drawing tool categories, loading messages and rework dialog have EN/LV/RU translations in `orderWorkspace.editor`.
- The review dialog focuses a relevant field when opened, cycles Tab focus inside the dialog, restores focus when closed, and permits Escape cancellation when no mutation is in flight.
- Non-Boss users can **read but not edit** a preassigned PO number in Review. Confirmation continues to rely on existing server authorization and file/revision checks.
- Reject actions block duplicate requests and cannot be dismissed while the mutation is in flight; success/error feedback is localized.

### Production dashboard and planning surfaces

- Dashboard shortcut fixes: `can(user, 'Production')` was not a defined feature; Orders and Production Board now use `can(user, 'viewOrders')`, and the Board route is `/production`, not `/kanban`.
- Production dashboard: graphite KPI hierarchy with distinct warning, rework and blocked treatments, compact cards and visible focus.
- Capacity planner: neutral input surface, clearer configuration/save hierarchy, mobile KPI and forecast reflow. The capacity Save primary styling targets only the Save action.
- Forecast utilization shows **actual booked-plus-proposed hours against configured capacity**. The progress indicator includes station-specific accessibility text, and over-capacity utilization has a semantic error colour; no new capacity calculation or projection is invented.
- Exception queue: severity-driven cards, semantic resolved/proposed indicators, accessible expanded states for evidence and history, responsive action controls and readable follow-up fields.
- Performance dashboard: compact KPI group, keyboard-scrollable complete comparison table (no column removal), clear estimate vs actual displays and responsive work records.
- Reservation ledger: approved bookings are successful green, proposed bookings warning amber; source state, hours and mutations are unchanged.
- Production evidence: readable, full-value audit records and distinct warning/error states. IDs, stock movements and evidence references are never retouched.
- Order workflow coach: selected current step, correct status semantics, accessible buttons and a brand foreground that works in dark/light themes.

## Invariants

No new order lifecycle transition, file-attachment payload, AI/OpenRouter execution path, stock mutation, capacity calculation, role permission, PO authorization rule, or production reservation API was introduced by this pass.

The source of truth for visual tokens remains `static/brand.css`. LUMIGRID magenta is for selection and primary actions; `--ok`, `--warn` and `--error` are for actual workflow state. The customer and manufacturing color codes remain untouched.

## Verification performed

All nine modified Svelte files were re-fetched from GitHub after the commits. A static inspection verified a balanced `<style>` section per file, correct Production Board route/permission references, mobile editor grid, preserved save handler, review-dialog focus and authorization guards, and complete EN/LV/RU translation keys. No CI, application build, unit test, server redeploy, or live browser visual verification was run.

## Deployment follow-up

1. On 320px, 390px and 720px widths, open an existing order and switch Focus/Show Canvas, change workspace tabs, edit long text, and verify the canvas remains unobscured and the Save action reachable.
2. In Review, verify keyboard Tab/Shift+Tab cycling and focus restoration for both confirmation and rejection. A Head of Production must not edit a Boss-assigned PO, but may confirm as allowed by server rules.
3. Simulate a slow rejection and verify the user cannot duplicate/dismiss the write until it completes. Test backend rejection and stale revision responses.
4. Visit Production Dashboard with Operator, StationHead, HeadOfProduction, Boss and RD, and verify the board shortcut and role-scoped actions.
5. For configured and overbooked stations, verify utilization displays exact sums, uses error colour only when capacity is exceeded, and exposes the same values to screen readers.
6. Open Exceptions, Evidence, Performance and Reservations at narrow and wide widths. Check result keys, notes, audit IDs, statuses, attachment references and focus states.
7. Check language switching, light/dark/high-contrast themes, keyboard controls and reduced-motion preferences.

These are **deployment-time checks, not completed test claims**.
