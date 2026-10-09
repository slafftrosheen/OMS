# Réclame Fabriek OMS

SvelteKit order-management and production workflow application with a self-hosted Supabase backend. The repository also contains Toolkit visual workspaces and private conversation services.

## Runtime architecture

- Frontend/API: SvelteKit 2 + Svelte 5 + TypeScript, built with `@sveltejs/adapter-node`.
- Database/auth/storage: self-hosted Supabase (PostgreSQL, PostgREST, Auth, Storage, Realtime, Edge Functions).
- Orders: `draft_orders` is canonical; `orders` is an updatable view. `ordersummary` and `order_summary` are read views.
- Files: `files` owns file metadata/storage keys; `order_files` links `draft_order_id` to `file_id` and carries `file_type`/`display_name`.
- Workflow: `order_stages` links to `draft_orders` through `draft_order_id`.
- Unit tests use the repository-local Vitest package at `packages/vitest`; no network service is needed for unit tests.

Check live DB schema/functions before relying on old migration-era assumptions.

## Toolkit — idea and project canvas

Toolkit is the shared visual thinking workspace at `/toolkit/canvas`. It features editable idea/research/decision/task/note cards, saved projects and starter layouts, connections, a contextual Brainstorm assistant that proposes cards for **explicit approval**, and secondary engineering tools. Old `/ai-lab` bookmarks redirect. Shared canvas edit rights belong to **RD, Boss and HeadOfProduction**; per-user brainstorming and conversations remain private. Toolkit now also supports authenticated team-shared PNG/JPEG/WebP/GIF/PDF imports, PDF page previews, drawing/annotation controls, and material surface-study cards; see [visual asset testing](docs/operations/OMS-R06-toolkit-visual-assets.md). Shared saves use revision checks, with a recovery-copy option on conflict. See [R06 sharing/stability runbook](docs/operations/OMS-R06-toolkit-sharing-stability.md) and [initial Toolkit design notes](docs/operations/OMS-R05-toolkit-canvas.md).

## OpenRouter tools and LumiGrid planning (OMS-R04)

Review the [R04 tool security and live-provider acceptance checklist](docs/operations/OMS-R04-ai-tool-hardening.md) before deploying. AI tool calls now honor signed-in user permissions, the crawler blocks private destinations and redirects, and LumiGrid estimates model **8 PWM outputs plus 8 addressable RMT lanes**. `GET /api/ai/health` does not probe OpenRouter; only RD can deliberately POST a single live inference diagnostic. **R01/R02 unapplied SQL migrations remain mandatory before this app release.**

## Operator workstation UI (OMS-R03)

The [OMS-R03 operator usability checklist](docs/operations/OMS-R03-operator-workspaces.md) covers mobile/tablet station UX, read-only production overview, real stage status, QR navigation, controlled rework resolution, error recovery, and manual accessibility checks. The R03 app still **requires all R01/R02 database migrations before deployment**.

## Manufacturing lifecycle (OMS-R02)

See [R02 deployment and end-to-end acceptance checklist](docs/operations/OMS-R02-manufacturing-lifecycle.md). **Four new atomic PostgreSQL RPC migrations must be reviewed/applied before deploying the R02 application.** R01's pending lock permission migration must also be accounted for. Do not deploy app-only first.

## Database/API contracts (OMS-R01)

The [OMS-R01 contract reconciliation notes](docs/operations/OMS-R01-contract-reconciliation.md) describe export, station log, loading-capacity, calendar and stage fixes, plus required live PostgREST/RLS smoke checks. One **unapplied privilege-hardening migration** is included; the private `exports` storage bucket remains an unverified prerequisite.

## Security and recovery (OMS-R00)

Before deploying R00, read [the production .env preservation and recovery checklist](docs/operations/OMS-R00-security-recovery.md). The public repository previously tracked a root `.env`; deleting it from HEAD does not purge Git history or rotate exposed credentials. Preserve the private runtime `.env` **before pulling**. Route handlers use request-scoped RLS-aware database clients; `/api/health` reports core readiness (AI optional), and `/api/healthz` is a minimal liveness probe.

## Local development and verification

```sh
npm install
npm run dev
npm run test
npm run check
npm run build
```

`npm run check` runs Svelte diagnostics; the current known baseline includes accessibility/style warnings, so review the final error count rather than assuming warning-free output. `npm run build` creates the adapter-node production server under `build/`.

## Production service (this host)

The OMS app runs as `reclame-oms.service` from `/opt/reclame-oms`, with `WorkingDirectory=/opt/reclame-oms`, `EnvironmentFile=/opt/reclame-oms/.env`, and `ExecStart=/usr/bin/node build/index.js`. Systemd binds the app on port 3000; it is intended for the internal tailnet. The database stack is Docker Compose-managed separately (containers named `supabase-*`). Do not restart or modify the database stack as part of a frontend/API release unless a DB change explicitly requires it.

AI chat and text-generation requests use the OpenRouter API, with `openrouter/free` as the development default. R&D users (role `RD`) manage the shared server-side key in Settings; it is stored through Supabase Vault RPCs and is not returned to the browser. Forge media, voice/audio, embeddings, vector retrieval, and knowledge ingestion were removed rather than routed back to local Ollama/sidecars. See `docs/openrouter-migration-plan.md` for feature scope, Vault migration, and remaining provider validation. A real OpenRouter key/request must be configured and tested before claiming live inference is operational.

After building, restart only the OMS app service and verify its health:

```sh
sudo systemctl restart reclame-oms.service
systemctl is-active reclame-oms.service
curl --fail --silent --show-error http://localhost:3000/ -o /dev/null
journalctl -u reclame-oms.service -n 80 --no-pager
```

No migration is applied automatically by the build or service restart. Review, back up, and apply SQL migrations separately.

## Database migrations

Migrations live in `supabase/migrations/`. Use the repository scripts to inspect/apply them:

```sh
npm run supabase:migrate:list
npm run supabase:migrate:push
```

Confirm the selected database/environment before applying a migration. RLS, role mapping, and data-changing SQL need separate review and verification.

## Documentation

- `CLAUDE.md` and `GEMINI.md`: current agent/developer conventions.
- `MIGRATION_GUIDE.md`: materials/inventory migration background (historical; verify live schema before acting).
- `SVELTE5_MIGRATION_AUDIT.md`: historical Svelte migration notes; treat findings as leads, not current status.
- `docs/draft-order-canvas-roadmap.md`: canvas feature parked; form-based order creation remains canonical.
- `scripts/dev/README.md`: developer-only scripts.
- `supabase/README.md`: migration pointers.

Do not store credentials, `.env` values, session notes, generated audit snapshots, or temporary execution reports in tracked documentation. Keep operational documentation tied to current code and mark historical notes explicitly.

## License / deployment

This application is designed for internal deployment. Consult deployment configuration and `.env.example` for environment-specific values; never publish secrets from `.env`.

More detailed AI node/model deployment notes are intentionally omitted here because node addresses and service capabilities change independently of the application code.