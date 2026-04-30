# Gemini CLI Guidelines — Réclame Fabriek OMS

## Development Workflows

### Environment Variables
- **Source of Truth:** Always use `/opt/reclame-oms/.env`.
- **Validation:** Changes to required variables must be updated in `src/lib/server/env-validator.ts`.
- **Supabase Keys:** If Supabase keys are reset in `/opt/supabase/docker`, they MUST be manually mirrored to `/opt/reclame-oms/.env`.

### Standalone Worker Compatibility
- Core libraries in `src/lib/server/` (specifically `logger.ts`, `config.ts`, `env-validator.ts`) are used by both the SvelteKit app and standalone workers (e.g., ingestor).
- **CRITICAL:** Do NOT import SvelteKit-specific modules (`$app/*`, `$env/*`) directly in these files. Use `process.env` fallbacks to ensure compatibility with `tsx` execution.
- If you must use SvelteKit modules, use dynamic imports or conditional logic based on the environment.

### Service Management
- The application runs as systemd services:
  - `reclame-oms.service` (SvelteKit app)
  - `reclame-ingestor.service` (Knowledge ingestor)
- After significant backend changes or `.env` updates, restart services:
  ```bash
  sudo systemctl restart reclame-oms.service reclame-ingestor.service
  ```

### Supabase & Migrations
- Use `npm run supabase:migrate:push` to apply migrations.
- Database is self-hosted in `/opt/supabase/docker`.

## Architectural Patterns
- **Svelte 5 Runes:** Use `$state`, `$derived`, `$props` for new components.
- **AI Swarm:** Distributed Ollama instances and Python sidecars on Windows nodes (ai1, ai2). Logic resides in `src/lib/server/ai`. Nodes are discovered via environment variables (`NODE1_HOST`, etc.).
- **Vector Search:** Uses `pgvector` for RAG. Core tables are `framework_docs`, `company_knowledge`, and `autonomous_memory`.
- **Maker System:** Domain logic for CNC/sketch management resides in `src/routes/ai-lab/maker`.
- **Tailscale:** Hardcoded IPs should be avoided; use constants from `src/lib/server/config.ts`.

## Deprecated Features
- **FAQ:** The FAQ page, associated API routes, and `public.faqs` table have been removed. Do not re-implement; use the AI Lab / Knowledge Base for similar functionality.

---

# Active Task: Spatial OS & Security Overhaul

## Initial Blueprint
**Context:** Major architectural refactor for SvelteKit (Svelte 5), Supabase, tldraw, makerjs, and Python sidecar.
**Rules:**
1. Execute sequentially.
2. Svelte 5 syntax ($state, $derived, $effect).
3. React Isolation for tldraw shapes.

## Full Plan
### Phase 1: Critical Security & RLS Hardening
- Audit and harden Supabase RLS (Prevent cross-user data leakage).
- Audit `src/routes/api/` (chat, conversations, AI sessions) for explicit user filtering.
- Verify frontend state clearing on logout.

### Phase 2: UI Restructure & Route Consolidation
- Consolidate `ai-lab` to: `overview`, `chat`, `knowledge`, `canvas`.
- Move `runs` and `swarm` UI into `overview`.
- Delete: `forge/`, `maker/`, `runs/`, `swarm/`, `tools/`, `voice/`.

### Phase 3: Fixing Forge & Sidecar Registration
- Fix Python sidecar advertisement/heartbeat.
- Fix SvelteKit node registry and health checks.
- Route Forge requests correctly via proxy.

## Current Progress (Phase 4)
- [x] **Phase 4: The Spatial Canvas**:
  - Built `TldrawWrapper.svelte` bridge to render `tldraw` safely inside SvelteKit.
  - Developed custom React Shapes (`MakerShape.tsx`, `ChatShape.tsx`, `ForgeShape.tsx`) with advanced interactivity (dynamic sliders, proximity-aware prompts, generative image execution).
  - Implemented the Spatial Query API (`/api/ai/canvas/spatial-query/+server.ts`) to process AI requests based on spatial bounding box context.

## Current Progress (Phase 2 & 3)
- [x] **Phase 2: UI Restructure**:
  - Consolidate AI Lab Overview, replacing `runs` and `swarm` standalone views.
  - Delete obsolete directories (`forge`, `maker`, `runs`, `swarm`, `tools`, `voice`).
  - Update `TopNav.svelte` and `paths.js` to expose only the 4 remaining main routes.
- [x] **Phase 3: Forge & Sidecar Fixes**:
  - Sidecar python server (`server.py`) now exposes detailed features in `/health`.
  - Swarm registry (`swarm.ts`) updated to independently track sidecar up/down status and explicitly log when nodes are missing/degraded.
  - SvelteKit health endpoint (`/api/ai/health`) aggregates status for all swarm nodes.
  - Added explicit fallback error logging in `forge/index.ts` to log *why* a node is missing.
