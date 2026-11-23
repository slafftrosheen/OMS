# Réclame Fabriek OMS — Round 6 "Quote & Go"

Builds on Round 5 (re-applied cleanly on `2c36e5b2`). Everything is additive: no database migration, no permission change, no order state-machine change, and the draft order form is untouched.

## 0. Fix in the production-layer commit (`2c36e5b2`)
- `installProductionLayers` called `editor.sideEffects.register(...)`, which does not exist in the installed tldraw 2.4.6. It runs in `CanvasApp` on every mount, so the canvas would throw on open. It now uses `registerBeforeChangeHandler` / `registerAfterCreateHandler` / `registerAfterChangeHandler` / `registerAfterDeleteHandler` with the same logic.
- `readLayerRestoration` and `productionLayerId` tolerate shapes without `meta` (fixes 2 failing tests in `drawing-commands.test.ts`).
- Layer list written to page meta as plain objects (type check now 0 errors, 0 warnings).

## 1. Canvas: machine time estimate (DXF review)
After **Review** in the DXF section, a new **Machine time estimate** block sits under the layer list.
- Machine presets: CO₂ laser, fibre laser, CNC router, cutting plotter. Every value is editable: cut / engrave / score feeds (mm/min), pierce or plunge time, travel allowance (%), copies. Values are remembered on the device.
- Each reviewed DXF layer gets an operation guessed from its name (Cut, Engrave/Gravēt/Гравировка, Bend/Score/Locīšana, Print/Reference/Annotation = not machined). The user can change it per layer.
- Time = length ÷ feed + one pierce per entity + travel allowance. Unknown lengths (calculation limit) show "Unknown", never a partial total.
- The summary shows a live chip "≈ 14 min 20 s". It is labelled as a planning figure, not a cycle time.

Files: `cad-cut-estimate.ts` (pure), `CutEstimatePanel.tsx`, `cut-estimate-copy.ts` (EN/LV/RU), `CadPanel.tsx` (+4 lines), `drawing-workspace.css`.

## 2. Canvas: nest material bill
**Nest on sheet** gets an optional **Price per sheet (€)**. The result adds *Material to issue* (sheets × and m²), *Material cost* and *Material per placed part*. Files: `cad-nesting.ts` (`nestMaterial`), `NestPanel.tsx`, `nest-copy.ts`.

## 3. Search and go (Ctrl/⌘ + K)
The existing search dialog becomes a command bar, with server search unchanged underneath.
- Empty: **Recently opened** orders (per user, per device, max 6), **Actions** (New order — only with `createDraftOrder`; Urgent orders; Open canvas) and **Go to** pages. Users / Materials only for RD, Boss, Head of Production, as in the nav.
- Typing ranks commands accent-insensitively in EN/LV/RU ("kalend", "склад", "dxf" all work).
- An order number (`PO-2611`, `po 2611`, `#2611`, `2611`) offers **Find order PO-2611** first; Enter goes to `/orders?q=PO-2611`.
- One arrow-key list across commands and server results; Enter with nothing highlighted takes the first row.

Files: `src/lib/search/quick-commands.ts` (pure), `GlobalSearch.svelte`, `orders/[id]/+page.svelte` (records recent order), `quick.*` keys in `en/lv/ru.json`, `Keybindings.svelte`.

## 4. Orders list keyboard
`J` / `K` move a highlighted row (rail mark on the left), `Enter` or `O` opens it, `E` expands it, `/` jumps to the filter. Keys are ignored while typing, in dialogs and on the canvas. Files: `src/lib/order/list-keys.ts` (pure), `orders/+page.svelte`.

## 5. Telegram
- **Bot /today** lists the most pressing orders first (most overdue at the top) and adds a digest line: `⚠ 2 overdue · ● 3 due today · 1 due tomorrow · 🚚 1 loading today`. Up to 3 pressing orders get a one-tap button (`⚠ PO-2611`) that uses the existing `oms:order:` callback.
- **Bot /orders** keeps the search order and adds the same digest line.
- **Mini App** home adds *Today at a glance*: Loading today, Due today, Unread — counting up, with a hazard edge when not zero. Today's orders list loading first, then due today. Taps give a light vibration.

Files: `telegram-order-lines.ts` (`telegramDueBucket`, `sortTelegramOrdersByUrgency`, `telegramDigestLine`), `telegram-bot.ts`, `src/lib/telegram/today-glance.ts`, `telegram/+page.svelte`.

## 6. Motion R6 (`static/fabriek-motion-r6.css`)
- **Order morph:** the clicked order title flies from its list row into the order page header (one shared View Transition name, set only on the clicked row).
- Keyboard rail mark on the highlighted row; search dialog drops on the gantry; quick rows and estimate rows cascade; estimate chip slides in.
- All have `prefers-reduced-motion` and `html[data-motion="off"]` fallbacks.

## Verify
```
npx vitest run tests/unit/cad-cut-estimate.test.ts tests/unit/quick-commands.test.ts tests/unit/order-list-keys.test.ts \
  tests/unit/telegram-digest.test.ts tests/unit/cad-nesting.test.ts tests/unit/telegram-order-lines.test.ts tests/unit/drawing-commands.test.ts
npm run check   # 0 errors, 0 warnings
npm run build
```
Manual: open the canvas (it must open — see §0), review a DXF with production layers and open *Machine time estimate*. Press Ctrl/⌘ + K and type `2611`. On /orders press J, J, Enter. In Telegram send /today.
