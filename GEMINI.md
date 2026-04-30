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
- **AI Swarm:** Logic resides in `src/lib/server/ai`. Nodes are discovered via environment variables (`NODE1_HOST`, etc.).
- **Tailscale:** Hardcoded IPs should be avoided; use constants from `src/lib/server/config.ts`.

