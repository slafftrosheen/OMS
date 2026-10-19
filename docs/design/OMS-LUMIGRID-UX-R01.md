# OMS — LUMIGRID visual and operator UX baseline (2026-10-19)

Reference: `slafftrosheen/lumigrid` → `design/tokens.json` and `lumigrid-lander-main/src/lib/styles.css`.

## Design contract

- **DarkVim:** background `#050505`, elevated graphite `#141416 / #1d1d1f / #2d2d2f`, primary text `#f5f5f7`.
- **Accent:** `#ff2d55` magenta is the primary action/selection; `#ff3b30` cherry is secondary. `#ff9500` amber and `#00d4ff` cyan are LED-detail accents, *not* substitutes for status or material colours.
- **LightVim:** neutral off-white surfaces; dark cherry `#bd1942` for legible accent text and controls. High-contrast theme remains independently defined.
- **Semantic states:** `--ok` green, `--warn` amber, `--error` red. Do not conflate production risk with visual branding.
- **Contrast:** use `--on-brand` for text/icons on the brand button; do not assume white foreground works with each theme.
- **Surfaces:** modest translucent glass over graphite; solid surfaces for forms and dense production/ordering data. Radii mostly 8–18px; avoid full-screen gradients, excessive glows, and multiple saturated CTAs.
- **Navigation:** visible, compact and keyboard-operable. Mobile toolbars may scroll horizontally; important order columns and actions must not disappear.
- **Animation:** short state feedback only; honor reduced-motion and reduced-transparency preferences. No decorative animation in dense workflows.
- **Tokens:** `static/brand.css` is the canonical source; component CSS should use semantic variables rather than ad hoc colour hexes. Raw RAL/Pantone/ORACAL colours, PDF technical diagrams and uploaded art are **data**, not UI chrome—preserve them.

## Implemented in this batch

1. Orders: compact toolbar, readable table, accessible filter press states and sort direction, horizontal small-screen access; no hidden critical columns; keep last successfully loaded data during refresh.
2. Production: graphite KPI strip, overdue emphasis, pressure-aware station cards, responsive visibility controls; QR actions use configured base path and reduced-motion scrolling.
3. New Order: form controls remain unchanged in data contract; graphite surfaces, keyboard-reachable file input, persistent preview/delete actions, responsive profile controls.
4. Toolkit: shell sizing, Canvas workspace/tool controls, Chat session/navigation/layout, correctly base-pathed Toolkit → Canvas redirect.
5. EN/LV/RU: corresponding operator guidance and accessibility strings.
6. Global buttons: unclassed buttons default to **neutral** rather than inheriting a saturated primary-CTA appearance. Explicit semantic buttons retain their variants.

## Guardrails for follow-up passes

- Do not alter predefined order profiles, attachment persistence, roles, draft/review/confirmation workflows, or OpenRouter execution just to change the UI.
- Do not display derived percentages, progress, or full-population KPIs from partial lists. Show an unavailable state when an aggregate backend is missing.
- Keep desktop and mobile keyboard focus, readable status, and dark/light contrast equally functional.
- Remaining: visual comparison at representative viewport widths after deployment, focus traversal through all forms, and checking every secondary station/admin/settings screen for legacy per-component CSS.

## Verification scope

Source changes were committed directly to `main`. Static source inspection and presence checks only; no CI, automated tests, or application build were executed as part of this visual pass. Production verification remains outstanding.
