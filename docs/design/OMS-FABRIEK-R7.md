# Réclame Fabriek OMS — Round 7 "Run Order"

Base: `222eeaa0` (Preserve named DXF layers in shared canvas imports). Patches: 0001 R5, 0002 R6 (rebased; one conflict in `cad-production-layers.ts` resolved by keeping your new `applyProductionLayerDefinitions`), 0003 R7. Additive: no migration, no permission or state-machine change, draft order form untouched.

**Still needed from R6:** `2c36e5b2` calls `editor.sideEffects.register`, which tldraw 2.4.6 does not have; `CanvasApp` runs it on every mount. Patch 0002 replaces it with the per-hook `register*Handler` calls.

## 1. Canvas: cut order and tool travel (DXF review)
- New option **Optimise cut order**. Engraving → scoring → cutting (by production-layer name). Within each step the route **finishes one part at a time**: its holes and inner contours first, then its outline, then the nearest next part. Closed polylines start at the corner nearest the tool (the pierce point moves; the shape does not). A safe drawing order is never made longer.
- Worked example (12 plates 300 × 200 with 4 holes each, drawn outline-first in a zig-zag): tool travel **16.34 m → 8.24 m (−50%)**, and every hole is cut before its plate's outline.
- The report shows **Tool travel between cuts: 12.40 m → 3.10 m −75%**, measured from the bottom-left of the job.
- The preview gains **Show tool travel**: dashed rapid moves in file order (marching) and a dot on the first cut. It always reflects the actual file order, optimised or not.
- Containment is judged by bounding boxes and the help text says so. Up to 4 000 entities; deterministic.
Files: `cad-cut-order.ts` (pure), `cad-dxf.ts` (`cutOrder` option + `result.cutOrder`), `cad-dxf-preview.ts` (`travel`), `DxfReviewPreview.tsx`, `CadPanel.tsx`, `cad-copy.ts` (EN/LV/RU), `drawing-workspace.css`.

## 2. Orders list remembers the view
- Search, filter, sort, direction and page are kept in the URL (`/orders?q=…&status=urgent&sort=client&dir=desc&page=2`), written with `replaceState` (no history spam). Back, refresh and shared links land on the same list. R5 deep links still work; other parameters such as `?place=` are kept.
- Changing a filter still resets to page 1; restoring a saved page does not. The page clamp waits for data.
Files: `src/lib/order/list-view-state.ts` (pure), `orders/+page.svelte`.

## 3. Order page: previous / next
- When an order was opened from the list, a stepper shows **‹ Previous · 3 of 24 · Next ›**; `[` and `]` do the same. The list is the filtered, sorted one (this tab only, up to 500 ids).
- **Back** returns to that same filtered list instead of the plain `/orders`.
- Opened from Telegram, search or a link: no stepper.
Files: `orders/[id]/+page.svelte`, `orderStep.*` in `en/lv/ru.json`.

## 4. Motion R7 (`static/fabriek-motion-r7.css`) — app-wide
1. **Navigation rail** across the top while a page loads, only after 180 ms (`navigating` in `+layout.svelte`).
2. **Dialogs**: backdrop fades, panel rises.
3. **Invalid fields** nudge once when they become invalid (`aria-invalid="true"`).
4. **Busy buttons** (`aria-busy="true"`) run a hazard stripe.
5. **Focus ring** settles in; **tabs / filter segments** draw their underline; **checkboxes** set with a small press; **cards** warm their border; **empty and alert states** fade up.
All with `prefers-reduced-motion` fallbacks; `html[data-motion="off"]` stops everything.

## Verify
```
npx vitest run tests/unit/cad-cut-order.test.ts tests/unit/order-list-view.test.ts
npm run check   # 0 errors, 0 warnings
npm run build
```
Manual: Canvas → DXF → tick *Optimise cut order* → Review → *Show tool travel*. /orders → filter Urgent, sort by client, page 2 → open an order → `]` → Back.
