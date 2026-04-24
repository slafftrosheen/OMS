# CLAUDE.md — Réclame Fabriek OMS

Guidance for Claude Code when working in this repo.

## Project
End-to-end production OS for visual signage (order intake → CAD → CNC → finishing → assembly → QC → logistics), plus a self-hosted AI orchestrator. Deployed entirely on an internal Tailscale network across a Raspberry Pi / K3s cluster — **no public internet access at runtime**, no third-party CDNs.

## Tech Stack
| Layer | Stack |
|---|---|
| Framework | SvelteKit 2, Svelte 5 (runes: `$state`, `$derived`, `$props`, `$effect`, snippets) |
| Language | TypeScript (non-strict), `svelte-check` for type-checking |
| Adapter | `@sveltejs/adapter-node` (precompressed) |
| Styling | Token-based CSS — single source in `static/brand.css`, extended by `src/app.css` and `src/lib/styles/*.css` |
| Icons | `lucide-svelte` (mix of named and subpath imports) |
| i18n | local `packages/svelte-i18n` |
| Charts | local `packages/apexcharts` + `svelte-apexcharts`, also `chart.js` |
| Backend | Self-hosted Supabase (PostgreSQL + pgvector + Auth + Storage + Realtime) |
| AI | Ollama (`deepseek-r1:14b` chat, `nomic-embed-text` embeddings) via Tailscale |
| PWA | service worker + install prompt + offline indicator |
| Tests | Vitest (unit), Playwright (e2e), axe-core (a11y) |

## Tailscale Topology
| Node | IP | Role |
|---|---|---|
| Frontend | `100.105.211.46` | SvelteKit + crawler worker |
| AI Server | `100.93.147.108` | Ollama + Open WebUI |
| Supabase | `100.98.202.69` | Postgres + Auth + Storage + Realtime |

IPs are hardcoded in `src/lib/server/ai/orchestrator.ts` and whitelisted in `svelte.config.js` CSP.

## Directory Layout

```
src/
  app.html            — loads /brand.css first, sets pdfjs worker
  app.css             — semantic aliases that extend brand.css (colors, buttons, status, nav)
  routes/             — 32+ pages (admin, analytics, calendar, chat, inventory, orders, production, station, …)
  lib/
    ui/               — generic primitives (Button, Input, Select, Modal, DataTable, Kanban, Tabs, Toaster, Icon, …)
    components/       — feature components (GlobalSearch, NotificationCenter, MobileNav, QRScanner, FileUpload, …)
    brand/            — BrandBar, TopNav, Logo (legacy, superseded by layout topbar)
    topbar/           — current topbar pieces (ThemeSwitch, LangSwitch, DensitySwitch, TextSizeSwitch, UserSwitch, NotificationsBell, MobileNav, ChatPopover)
    styles/           — a11y.css, responsive.css
    state/            — appState.svelte.ts (UI prefs: theme, density, fontScale)
    auth/             — authState.svelte
    order/            — orderState.svelte
    server/ai/        — RAG orchestrator + tools + chat routes
    {domain}/         — inventory, materials, orders, profiles, scanning, calendar, chat, faq, pdf, search, export, backup, webhooks, …
static/
  brand.css           — PRIMARY design tokens + base component styles (~370 lines)
  manifest.json, sw.js, service-worker.js, icons/, brand/
packages/             — vendored: apexcharts, svelte-apexcharts, svelte-i18n, vitest
supabase/migrations/  — SQL migrations (run via scripts/supabase-migrate.sh)
tests/                — a11y, api, e2e, lib
```

## Design System (current)

- **Source of truth:** `static/brand.css`, loaded before anything via `app.html`. `src/app.css` adds semantic aliases (e.g. `--color-primary` → `--brand`) for back-compat.
- **Themes** (set on `<html data-theme>` via `lib/state/appState.svelte.ts`):
  - `LightVim` — OKLCH off-white surfaces, Reclame Red brand
  - `DarkVim` — Apple-style deep black + frosted greys, `#ff453a` brand
  - `HighContrastVim` — pure black/white, no glass
- **Glass tokens already present:** `--glass-bg`, `--glass-blur` (`blur(24px) saturate(180%)`), `--glass-border`, `--glass-border-highlight`, `--glass-shadow`.
- **Scale knobs:** `--text-zoom`, `--font-scale`, `--density` (compact/cozy/comfortable) — all multiplied into spacing and control sizes. Respect these in new CSS (never hardcode px).
- **Radii:** `--radius-sm 8px`, `--radius-md 16px`, `--radius-lg 24px`, `--radius-full 999px`.
- **Motion:** `--transition-fast 0.15s`, `--transition-smooth 0.3s` on a `cubic-bezier(.2,.8,.2,1)` Apple-like curve.
- **Font stack:** currently `system-ui, -apple-system, Segoe UI, Roboto, Inter, …` — **no bundled fonts**.
- **Icons:** `lucide-svelte`, used in 100+ files. Mix of `import { X } from 'lucide-svelte'` (pulls entry bundle) and `import X from 'lucide-svelte/icons/x'` (tree-shakable). The latter is preferred.
- **Two parallel chrome surfaces exist:** the live topbar in `src/routes/+layout.svelte` and a legacy `src/lib/brand/BrandBar.svelte` (not mounted). Don't edit BrandBar unless asked.

### CSS rules
- Every color, spacing, radius, shadow, blur, transition must come from a token. Use `color-mix(in oklab, …)` for tints rather than inventing colors.
- Use `--glass-bg` + `backdrop-filter: var(--glass-blur)` + `1px solid var(--glass-border)` + `var(--glass-shadow)` for elevated surfaces.
- Respect `--topbar-h`, `--rail-safe`, `--content-max` layout constants.
- a11y: `:focus-visible { box-shadow: var(--focus-ring) }` — don't swallow focus rings.

## Commands

```bash
npm run dev              # vite dev --host (LAN-accessible)
npm run dev:clean        # wipe .svelte-kit / vite cache and start
npm run build            # production build (adapter-node)
npm run check            # svelte-check type-check
npm run lint             # eslint
npm run format           # prettier
npm run test             # vitest run (unit)
npm run test:watch
npm run test:a11y        # tsx tests/a11y/run-tests.ts (axe-core)
npm run test:contrast    # tests/a11y/contrast-check.ts

npm run supabase:migrate:create NAME
npm run supabase:migrate:push
npm run supabase:migrate:list
npm run migrate          # supabase db push (shorthand)

npm run crawler -- <url> [--follow] [--max-pages N]   # RAG doc crawler
npm run docker:build | docker:run | docker:logs | docker:stop
```

## Svelte 5 migration status
~85% on runes. A few legacy bits flagged in `SVELTE5_MIGRATION_AUDIT.md`:
- Couple of `$app/stores` holdouts that should move to `$app/state` (`Chat.svelte`, `MobileNav.svelte`).
- Global state singletons imported directly in 27+ files (SSR bleed risk). New code should take state via `setContext` / `getContext`, matching the layout pattern.

Prefer Svelte 5 runes for any new component. Use snippets (`children`, `{@render …}`) over slots.

## Conventions
- State classes live in `*.svelte.ts` files (`$state` at module level is fine for singletons, but context-inject in the layout instead of importing globally in new code).
- i18n: use `$t('key', { default: 'Fallback' })`. Keys organized in `src/locales/*`.
- Auth: `currentUser` in `$lib/auth/authState.svelte`. Public routes: `/login`, `/help`.
- Icons: prefer subpath imports (`lucide-svelte/icons/<name>`) — tree-shakable.
- Write token-based CSS. Avoid hex literals outside `static/brand.css`.
- When adding a page, wrap content in `<main class="rf-page">` is already done by `+layout.svelte`; pages just render into it.

## Don't
- Don't hardcode Tailscale IPs in new code — reuse the constants already in `src/lib/server/ai/orchestrator.ts` or add to env.
- Don't add public-CDN fonts/scripts — deployment is air-gapped to the Tailnet. Bundle locally.
- Don't drop the existing token system — extend it.
- Don't skip the font-scale/density multipliers when adding spacing.
