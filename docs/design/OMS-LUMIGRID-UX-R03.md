# OMS — LUMIGRID operator UX R03

Date: 2026-10-19. Continuation of `OMS-LUMIGRID-UX-R01.md` and `OMS-LUMIGRID-UX-R02.md`.

## Scope committed to `main`

| Screen | Delivered | Preserved |
| --- | --- | --- |
| Logistics dashboard | Graphite surface hierarchy; honest unavailable KPI values (not fabricated zeroes), working `viewCalendar`/`viewInventory` feature checks, Orders shortcut to a supported URL, accessible navigation | Capacity endpoints and logistics permissions; no new dispatch behaviour |
| Order detail | Responsive order header, 4-up desktop metadata, graphite stage cards, canonical workspace links that respect `base`, correct missing date/price/progress display | Lifecycle mutation endpoints; stage transitions; order forms; attached files |
| Order review | Clear priority severity; responsive order summaries, localized EN/LV/RU review and PO-confirmation messages; explicit retry state on failed first load | Latest version + linked-files check, PO validation, confirm/reject APIs, user role gates |
| Order workspace/edit | Refined toolbar, split canvas/form layout, mobile panel, focus indicators and branded primary action. Native order/profile forms and OpenRouter handlers untouched | Form shape, autosave, unsaved-change warning, collaboration, profiles, file references |
| Material detail | More readable stock and metadata surfaces, touch-accessible quantity stepper, EN/LV/RU labels, fixed an invalid CSS `min_stock-width` declaration | Stock IN/OUT mutation API and audited ledger rules |
| Inventory movements | Scrollable keyboard-accessible full audit table, semantically distinct IN (green), OUT/order (red) | Audit events, units, references and timestamps |
| Inventory reconciliation | Graphite count-comparison table, clear physical-count modal, semantic caution styles, keyboard-scroll region | Reconciliation RPC, idempotency key, physical count + note requirements |
| Replenishment | Compact summary, readable planning tables, confirmation dialog hierarchy and accessible scrolling | Requests, ordering state, supplier choice, receipt semantics |
| Material catalog | Entire catalog entries link to their actual material detail; real `hex_color` sample when supplied, accessible filter/search, mobile grid | Manufacturer colours, material identity, stock figures |
| New material | Visual form hierarchy, selected section press state, keyboard focus, responsive controls | Existing stock initialization, validation, save payload and form fields |

## Visual baseline

Use `static/brand.css` semantic variables. Graphite `--bg-0..3` define working surfaces. Use `--brand`/`--brand-2` for primary actions and selection, `--on-brand` for their foreground. Actual production risk remains `--ok`, `--warn`, `--error`. Never recolour customer art, swatch hex values, or uploaded print/PDF evidence to match the UI brand.

On data-heavy screens, mobile adaptations favor full accessible scrolling, wrapped controls, and legible metadata—not silent column removal. Prefer modest glass on chrome, solid graphite for forms and operational tables. Respect focus, reduced-motion and reduced-transparency preferences.

## Verification constraints

Source changes were directly committed to `main` after reading actual GitHub files. Static checks verified expected selectors, navigation corrections, three JSON catalogs, and targeted source properties. **No CI, build, deployment, browser visual comparison, or runtime test was run.**

Manual checks after the next deployment:
1. Orders: open existing, pending review, dispatched and archived; verify role-scoped actions, data shown when dates and stages are missing, and canonical workspace links.
2. Review: as RD, Boss, HeadOfProduction and Operator, verify queue access and confirmation: PO assignment must remain Boss-only; verify file readiness and revision checks.
3. Logistics: validate capacity values, loading-day stats when each endpoint fails, and all visible shortcuts.
4. Native order workspace: test each existing form, drag/drop files, PDF preview, Canvas manipulation, AI assistant, unsaved-change warnings, focus mode and mobile dock.
5. Inventory: check stock add/remove auditable transactions, low stock, material swatches, catalog/detail navigation, replenishment status, and reconciliation receipts.
6. Three language settings and viewport widths 320/390/768/1280/1920. Pay particular attention to fixed-height workspace interactions and modal keyboard focus.

## Remaining

A deployed visual comparison against LUMIGRID references, full contrast audit, Svelte build/type verification at the appropriate release gate, and operational UX review with workshop staff. Neither successful compilation nor runtime safety is claimed by source-only changes.
