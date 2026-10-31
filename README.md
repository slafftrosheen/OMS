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

## Current release readiness

For the current `main` release, use the [OMS-R26 deployment readiness runbook](docs/operations/OMS-R26-deployment-readiness.md) together with the feature-specific [R41](docs/operations/OMS-R41-inventory-provenance-and-reconciliation.md), [R42](docs/operations/OMS-R42-canonical-inventory-parity.md), and [R44](docs/operations/OMS-R44-inventory-replenishment-planning.md) acceptance notes. The read-only preflight checks production and inventory schema, RPC grants, RLS, and inventory consistency observations through R44. It does not apply migrations or prove role behavior in a browser.

Compare the compiled server's `GET /api/build-info` revision with the intended checkout when diagnosing a deployment. A matching fingerprint does not prove that database prerequisites are installed; confirm those separately on staging before release.

## Shared assistant and material catalog

A single floating **Assistant** button is available on signed-in screens, including native profile editors. The drawer combines current-screen help with existing order discussion, file intake, readiness and canvas tools. A compact context preview follows current selections, unsaved edits and partial results; suggested workflow buttons open only after a user click. Context is collected again when a question is sent, and obsolete reads are discarded after account or record changes. Available lookups follow server-side role and station permissions, including exact catalog comparisons with readable, scrollable tables. Provider configuration stays in R&D Settings. See [the shared assistant contract](docs/operations/unified-assistant.md) for lifecycle, extension points and verification.

Local next-step guidance follows loading errors, unapplied profile selections, cabinet forms and chat controls before any provider request. If screen details change while a question is in flight or after an answer, the drawer identifies the earlier snapshot and offers a fresh-review question. Team-chat context contains interface flags and counts only; conversation text, names, attachments and recordings are excluded.

Order material pickers retain the selected product/model, and FACE, BACK, SIDES and FRAME use the same thickness selector. BACK includes GS, XT and LED acrylic alongside sheets, composite and PVC; flatstock and profiles belong to FRAME. The [workshop aluminium sheet family](supabase/catalogs/workshop-materials.md) provides the specified 1500 × 3000 mm format and nine thickness choices. Legacy selections remain readable without being offered for an unsuitable new role.

Selected LED controls show brand, temperature and power; PSUs show brand, rated power and series; main cables show recorded diameter or conductor size, voltage rating and the entered length from the sign. Full identity and specifications remain available in the picker and inventory details. Reel contents and stock units stay separate from the sign's cable length. The [branded Lemona catalog](supabase/catalogs/README.md) contains 128 sourced products across five additive snapshots, including MEAN WELL XLG supplies, AKTO/LEMLUX strips, LAPP mains cables, WAGO connectors, filaments and resins. Catalog migrations are applied separately from the application build and preserve existing inventory and business fields.

Selected components use shared category colors with contrasting text; real material and paint swatches retain their catalog color. The next enabled action in order guidance and the cabinet receives a quiet halo, with reduced-motion and high-contrast support.

## Personal cabinet and workforce reports

Every signed-in user has **My cabinet** at `/cabinet`, with daily hours/minutes, a current-month card, month-by-month history and full/partial-day absence notices. Actual worked time and credited time are stored separately: the company policy credits Saturdays, Sundays and Latvian public holidays/observed days at **2× once**, including a holiday that falls on a weekend. Missing entries remain distinguishable from a deliberate zero-hour entry.

The month overview shows saved time, zero entries, absences, upcoming days and 2× dates, with keyboard navigation and guarded selection into the entry form. Managers can search workers by name or username and filter the team while keeping whole-team totals clearly labelled. The report archive separates monthly hours from daily absences and shows the latest version for each period by default; historical versions remain accessible.

**R&D (`RD`), Boss and Head of Production** can review every worker, month and saved report; other users can access only their own records. The production server prepares daily absence reports at **08:00 Europe/Riga** and a consolidated report for the previous month on the **first at 08:00 Europe/Riga**, with in-app notifications to the Head of Production. Absence changes also notify the Head of Production immediately. Durable job leases prevent duplicate scheduled reports; missed monthly reports catch up after downtime. Late corrections mark snapshots stale, and managers can generate a new version and export CSV.

The separate `20261031000003_workforce_cabinet.sql` migration and the running server's service-role database configuration are required before scheduled reporting can run. See [the cabinet and reporting guide](docs/operations/workforce-cabinet.md) for permissions, calendar sources, scheduling, database validation and release steps.

## Team chat and voice messages

Human conversations support voice recording, preview, discard, send and inline playback across team channels, direct messages and order discussions. A recording can be up to five minutes and 15 MiB. Voice audio expires **three calendar months after sending**; expired recordings leave a readable marker, and the retention worker removes their stored audio. Text messages have no automatic expiry and are never deleted by the voice cleanup job.

All human-chat surfaces can load earlier messages with stable timestamp-and-ID paging. Composers retain text and mentions until sending is confirmed and offer a visible retry path. The mobile chat page includes conversation selection. Voice players show the expiry in Riga time, offer playback speed controls and pause the previous recording when another starts.

Voice access follows the existing conversation permissions. Playback uses an authenticated app endpoint, and the database owns the expiry deadline. The `20261031000004_chat_voice_retention.sql` migration, private storage and service-role server configuration are required. Recording requires HTTPS (or localhost), browser microphone permission, and a supported recorder. The server uses `ffprobe` to validate the audio and its actual duration; the Docker runtime includes it through the `ffmpeg` package. See [voice messaging operations](docs/operations/chat-voice-messages.md) for retention, deployment and verification.

## Toolkit — idea and project canvas

Toolkit is the shared visual thinking workspace at `/toolkit/canvas`. It features editable idea/research/decision/task/note cards, saved projects and starter layouts, connections, a contextual Brainstorm assistant that proposes cards for **explicit approval**, and secondary engineering tools. Old `/ai-lab` bookmarks redirect. Shared canvas edit rights belong to **RD, Boss and HeadOfProduction**; per-user brainstorming and conversations remain private. Toolkit now also supports authenticated team-shared PNG/JPEG/WebP/GIF/PDF imports, PDF page previews, drawing/annotation controls, and material surface-study cards; see [visual asset testing](docs/operations/OMS-R06-toolkit-visual-assets.md). Shared saves use revision checks, with a recovery-copy option on conflict. See [R07 upload repair, Canvas skills and deployment checks](docs/operations/OMS-R07-toolkit-stability-and-skills.md) and [R06 sharing/stability runbook](docs/operations/OMS-R06-toolkit-sharing-stability.md) and [initial Toolkit design notes](docs/operations/OMS-R05-toolkit-canvas.md).

## OpenRouter tools and LumiGrid planning (OMS-R04)

Review the [R04 tool security and live-provider acceptance checklist](docs/operations/OMS-R04-ai-tool-hardening.md) before deploying. AI tool calls now honor signed-in user permissions, the crawler blocks private destinations and redirects, and LumiGrid estimates model **8 PWM outputs plus 8 addressable RMT lanes**. `GET /api/ai/health` does not probe OpenRouter; only RD can deliberately POST a single live inference diagnostic. R04's R01/R02 migration note is historical; use the current release readiness section above for the full gate.

## Operator workstation UI (OMS-R03)

The [OMS-R03 operator usability checklist](docs/operations/OMS-R03-operator-workspaces.md) covers mobile/tablet station UX, read-only production overview, real stage status, QR navigation, controlled rework resolution, error recovery, and manual accessibility checks. Its R01/R02 deployment note applies to that historical release; use the current release readiness section above for `main`.

## Manufacturing lifecycle (OMS-R02)

See the [R02 deployment and end-to-end acceptance checklist](docs/operations/OMS-R02-manufacturing-lifecycle.md) for the original manufacturing-lifecycle release. Its migration gate is historical for that release; use the current release readiness section above when preparing current `main`.

## Database/API contracts (OMS-R01)

The [OMS-R01 contract reconciliation notes](docs/operations/OMS-R01-contract-reconciliation.md) describe the original export, station log, loading-capacity, calendar and stage contract work. Its unapplied-migration and private `exports` bucket notes are historical status; use the current release readiness section above for present deployment prerequisites.

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

`npm run check` runs Svelte diagnostics; resolve errors and review any accessibility or style warnings before release. Run it before `npm run build`, which creates the adapter-node production server under `build/`; both commands update `.svelte-kit`.

## Production service (this host)

The OMS app runs as `reclame-oms.service` from `/opt/reclame-oms`, with `WorkingDirectory=/opt/reclame-oms`, `EnvironmentFile=/opt/reclame-oms/.env`, and `ExecStart=/usr/bin/node build/index.js`. Systemd binds the app on port 3000; it is intended for the internal tailnet. The database stack is Docker Compose-managed separately (containers named `supabase-*`). Do not restart or modify the database stack as part of a frontend/API release unless a DB change explicitly requires it.

AI chat and text-generation requests use the OpenRouter API, with `openrouter/free` as the development default. R&D users (role `RD`) manage the shared server-side key in Settings; it is stored through Supabase Vault RPCs and is not returned to the browser. Forge media and AI audio generation, embeddings, vector retrieval, and knowledge ingestion were removed. Team voice messages use the separate authenticated chat storage described above. See `docs/openrouter-migration-plan.md` for AI feature scope, Vault migration, and remaining provider validation. A real OpenRouter key/request must be configured and tested before claiming live inference is operational.

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
