# OMS-R03 — Operator-first production UI and usability pass

**GitHub-only change:** The source is committed to `main`, not released to the live system. OMS-R02's four unapplied SQL migrations plus OMS-R01's privilege migration **remain mandatory prerequisites** to use the new R03 workflows. Never install R03 app code ahead of its dependent DB functions.

## What changed

### Production overview (`/production`)
- Overview is now **read-only**: the previous selector conflated order lifecycle status with station-stage status and allowed direct `COMPLETED`, contradicting R02 material consumption requirements.
- Orders use accessible links to their details; station headings have direct **Workstation** links.
- The board API resolves `order_stages.state` explicitly, instead of displaying `ordersummary.status` as a stage.
- Visible station and assignment counts, a hide-empty-stations toggle, no shared filesystem or new database dependency.
- The screen retains last-good data on transient errors, exposes a retry action, distinguishes initial skeleton loading from refresh, and polls only while the tab is visible.

### Station workspace (`/station/[station]`)
- Operator-only buttons are disabled if the user lacks station assignment; API enforcement remains authoritative.
- QR identification **opens** an order; it does not silently start work.
- Station search matches PO number, client, title and order UUID; filters have aria-pressed semantics.
- Priority ordering is intentional (urgent/high first, then earliest deadline). Numeric legacy priorities render as `P9` while named priorities render as `High`, `Normal`, etc.
- Freshness and error states are visible without losing last-good orders, no toast spam from periodic refresh; polling pauses while workflow dialogs are open.
- Buttons and filter controls target at least 44px on touch screens, order cards wrap at phone widths and reduced-motion users do not receive unnecessary animations.
- A real **Resolve rework** dialog records resolution notes via `PATCH /api/orders/:id/rework?rework_id=...`; the stage cannot be resumed from REWORK through the generic PATCH.
- The completion dialog checks whole integer quantities against stock, requires a skip reason and reports inventory search outages explicitly.

## Test / manual acceptance matrix

Run on a **staging database with R01+R02 migrations applied** and sample orders, not on production:

| Viewport | Scenario | Acceptance |
| --- | --- | --- |
| 360 x 800 | Station on a phone | One-column cards, horizontal status filter, no clipped buttons or horizontal page overflow |
| 768 x 1024 | Operator tablet | Scan QR, read linked order, explicit Start, progress, Complete dialog |
| 1440 x 900 | Manager desktop | Production overview, counts, hide empty, direct station navigation and search |
| Keyboard only | Screen reader/keyboard | Tab/focus outlines, pressed filter state, error alert, dialog escape/cancel |
| Offline/fault | Initial and periodic load | Initial error + retry; last-good list retained if periodic refresh fails; no repeated toasts |
| Unassigned user | Station workspace | View-only notice, mutation buttons disabled, API 403 remains authoritative |
| Production | Dispatch lifecycle | No direct COMPLETED choice on board; completion requests materials or explicit skip reason |
| Rework | Open/resolve cycle | REWORK shows Resolve rework; generic stage resume is rejected until cycle is resolved |
| Inventory | Material declaration | Decimal, zero, above-stock values blocked; no empty skipped reason |
| Date/priority | Mixed legacy and canonical rows | P9 and HIGH display correctly; overdue deadline visible and high-priority work first |

Run `npm ci`, `npm run test`, `npm run check`, `npm run build`. Also run the existing R02 transactional smoke tests before app deployment; **unit and source-contract tests cannot establish production RLS, real keyboard focus trapping, or database correctness**.

### Compatibility and remaining UX backlog

This pass targets the production overview, station workspace, and completion dialog. It does **not** claim the entire OMS is redesigned: order-entry form, loading calendar, inventory screens, settings/admin and the entire translation catalog still require subsequent dedicated reviews. New user-facing copy includes English fallback strings; production RU/LV translation coverage needs a separate localization sweep.

Important: rework completion depends on `resolve_order_rework` from R02; until those SQL functions are installed, the UI will show an API error rather than bypass production control. No live environment, GitHub Actions, Supabase migrations, restarts or credentials were touched.
