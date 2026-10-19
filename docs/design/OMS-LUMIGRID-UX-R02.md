# OMS — LUMIGRID UX R02: secondary operations surfaces

Date: 2026-10-19. Continuation of `docs/design/OMS-LUMIGRID-UX-R01.md`.
Reference: `slafftrosheen/lumigrid/lumigrid-lander-main` and its design tokens.

## Implemented

| Screen | UI/UX changes | Workflow boundaries |
| --- | --- | --- |
| Settings | Graphite dual-column layout, legible theme/scale/density selection, focus indication, responsive OpenRouter credential area, EN/LV/RU translations | Existing `/api/settings/openrouter` GET/PUT/DELETE and R&D role guard unchanged |
| Individual station | Denser KPI counters, correct contrast for queued/in-progress/blocked/rework/completed, horizontally scrollable queue filters, readable order actions, localized operator strings | Workstation mutations, rework cycle RPC, stage permissions and QR/Chat preserved |
| Administration | Primary new-order/review shortcuts now target `/orders/new` and `/orders/review`; section links point to real routes and are guarded by `can()` | No new role grants, no admin API contract changes |
| Admin users | Accessible searchable table, labelled user edit/password controls, dialog title and keyboard focus styles, mobile table scroll | User creation, role/station assignment, password and active-state mutation unchanged |
| Admin materials | Graphite product cards, accessible controls/modal, preserved physical material swatch colours | Material editing, deletion, and form field contracts unchanged |
| Production calendar | Selected dates and filters expose pressed state, labelled month navigation in 3 languages, responsive week grid and sensible schedule order on tablet | Loading day API, assignment action and CSV export unchanged |
| Inventory | Accessible horizontal warehouse tables, compact group controls, better focus/low-stock states; nested add buttons avoid toggling group expansion | Inventory persistence and precise stock values unchanged |

## Design and accessibility guardrails

1. `--brand` is an action colour, not a production/status indicator. Use `--ok`, `--warn`, `--error` for actual status; use the neutral graphite steps for dense data.
2. `--on-brand` is the foreground on a primary brand background, with a theme-specific contrast pairing.
3. Product swatches, RAL/ORACAL/Pantone codes, PDF/export colour values and customer files are source data. Never globally recolour them.
4. A useful order/stock field must not silently disappear on mobile. Scrollable regions must be keyboard focusable. Do not convert tables to truncated one-line representations.
5. A disabled/hover-only control must not conceal important actions from touch or keyboard users.
6. Translation text belongs in `src/locales/{en,lv,ru}.json`. UI labels and accessible descriptions must follow the selected language.
7. Keep the predefined order creation form and OpenRouter assistant independent; style refactoring must not alter form payloads or assistant execution.

## Manual verification after deployment

- Visit Settings in DarkVim, LightVim and HighContrastVim; verify text size and density persistence, locale switching, focus borders, and role-scoped OpenRouter key handling using a safe test key.
- Open each role's Admin dashboard. Validate create/review/inventory/user links point to real, authorized screens and forbidden actions remain denied by server-side checks.
- Search and scroll Users; open create/edit/password dialogs on desktop/mobile. Validate role and station assignment controls without changing production accounts.
- In Materials, confirm the correct manufacturer colour swatches (not magenta-tinted), grouped cards, edit form and delete confirmation.
- At each station, inspect queued, blocked, in-progress and rework cards; check QR, chat, progress, block/unblock and rework-resolution modals with authorized and read-only accounts.
- On Calendar verify one-month navigation, order counts, keyboard selection, loading-day creation and assignment plus narrow-screen seven-column grid.
- In Inventory verify nested Add clicks don't close their groups, low-stock state, search, CSV export, all subgroup tables and keyboard scrolling.
- Check 320px, 390px, 768px, 1280px and 1920px widths, especially modal clipping and toolbar overlap.

## Validation performed in this development pass

GitHub default-branch source reads, source presence checks and parsing all three translation JSON files. **No build, CI, deploy, browser screenshot review or runtime test was executed.** This batch is source-committed, not deployment-certified. Follow-up visual validation remains required.
