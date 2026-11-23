# Réclame Fabriek OMS — Round 5 "Flow & Motion"

Builds on UI kit v1.0 (already merged as `df5645d9`) and on the canvas, DXF and Telegram work that followed. Everything here is additive. Nothing changes the database, the permissions, the order state machine or the draft order form (`rf-draft-form-lock` still passes).

## 1. Canvas: Nest on sheet
Open **Arrange › Arrange task › Nest on sheet**. It sits next to Step and repeat and Rotate / circular copies.

- Select two or more objects. The sheet can be the drawing page, a stock preset (1000 × 2000, 1220 × 2440, 1250 × 2500 or 1500 × 3000 mm) or a custom size. Then set the edge margin, the spacing between parts (include the kerf here), whether parts may turn 90°, and the maximum number of sheets.
- **Preview layout** draws the sheets in the panel and reports parts placed, sheets used, how many parts turned, box coverage per sheet, parts too large for the sheet, and parts left over after the sheet limit.
- **Nest objects** moves the objects in one undoable step. It re-checks locks and rolls the whole step back if any check fails. Sheet 2 and later are laid out 100 mm to the right of sheet 1.
- Only top-level, unlocked objects move. Objects inside groups or frames stay where they are.
- The packing is honest bounding-box MaxRects (best short-side fit, largest parts first, results repeatable). It is **not** true-shape nesting, and the panel says so. Coverage is the share of the usable sheet covered by the part boxes.

Files: `src/lib/components/canvas/cad-nesting.ts` (pure), `NestPanel.tsx`, `nest-copy.ts` (EN/LV/RU), `arrange-task-copy.ts` (new `nest` task), `DrawingWorkspace.tsx` (2 lines), `drawing-workspace.css`. Tests: `tests/unit/cad-nesting.test.ts`.

## 2. Order flow
Every order page shows **Order flow** under the header: Draft → Review → Confirmed → Production → Loading → Dispatched → Archived. It also shows **the one next step** and who owns it (Author, Head of Production, Production floor or Logistics).

- In production it names the station that holds the route: the blocked or rework station first, then the running one, then the next to start. A blocked step gets a hazard stripe and an icon, so it never relies on colour alone.
- The button only maps to a control the page already shows under the same permission: Continue draft, Open review, Open stations (scrolls to the stage controls), Mark dispatched or Archive. If the user has no such right, no button appears. On hold it proposes nothing.

Files: `src/lib/order/order-flow.ts` (pure), `OrderFlowStrip.svelte`, `orders/[id]/+page.svelte` (strip and handler), and the `orderFlow` keys in `en/lv/ru.json`. Tests: `tests/unit/order-flow.test.ts`.

**Orders deep links:** `/orders?q=PO-2611&status=urgent` now pre-fills search and filter. Telegram and notifications use this.

## 3. Telegram
**Mini App** (`webapp.ts`, `TelegramAppShell.svelte`, `telegram/+page.svelte`, `state/place.ts`):
- Follows Telegram's light or dark scheme (Paper / Night shift) through the existing By place mechanism. `?place=` still wins.
- Paints Telegram's header, background and bottom bar in the page tone, and updates on `themeChanged`.
- Respects Telegram's content safe area (`--tg-inset-top` / `--tg-inset-bottom`) and turns off swipe-to-close so it doesn't fight scrolling in chat, lists and canvas.
- Haptics: a selection tick on tab change and a light tap on actions. Each SDK feature is version-checked and fails silently.
- Home adds **Find an order** (goes to `/orders?q=`) and an **Urgent orders** shortcut. Tabs get a sliding indicator, the unread count stamps in, and content switches on in order.

**Bot replies** (`telegram-order-lines.ts`, `telegram-bot.ts`): status is shown as a word in the user's language (for example "Ražošanā" instead of IN_PRODUCTION). Open orders get a flag: `⚠ Overdue N d`, `● Due today` or `Due tomorrow`, counted as Riga calendar days from the payload date. Raw dates stay in the reply. Tests: `telegram-order-lines.test.ts` and `telegram-webapp.test.ts`.

Nothing changes in bot settings, commands, authorization or the database. **Publish bot menu** works as before.

## 4. Motion v0.5
- **Page transitions:** pages slide forward or back on the gantry rail through the View Transitions API, while the top bar holds still. They are skipped on canvas, editing and chat routes and under reduced motion (`onNavigate` in `+layout.svelte`, `src/lib/ui/motion.ts`).
- **KPI count-up:** the action keeps the displayed format (`1 240`, `86%`, `€3.5k`). Screen readers get the final value. KPI cards switch on with the power-on effect.
- **Order rows** cascade in (`use:stagger` on the orders table).
- **Skeleton scan, press feedback** on buttons, filters and tabs, **toast travel**, **status stamp**, and **disclosure on rail**: all in `static/fabriek-motion-r5.css`, loaded after `fabriek-motion.css`.
- Every animation has a `prefers-reduced-motion` fallback. `html[data-motion="off"]` stops all motion.

## Verify
```
npx vitest run tests/unit/cad-nesting.test.ts tests/unit/order-flow.test.ts tests/unit/telegram-order-lines.test.ts tests/unit/telegram-webapp.test.ts tests/unit/rf-motion.test.ts
npm run build
```
Manual: in Telegram, switch the app between light and dark and check that the Mini App and its header follow. On an order in production with a blocked station, check that the strip names that station. On the canvas, select parts and use Arrange › Nest on sheet › Preview, then Nest objects, then Undo.
