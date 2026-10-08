# Gemini CLI Guidelines — Réclame Fabriek OMS

## Runtime and environment

- Use the repository root `.env` only for local runtime configuration. It is ignored by Git and contains private configuration; never print, stage, commit, or publish its values.
- The deployed SvelteKit app runs as `reclame-oms.service` from `/opt/reclame-oms` with `/usr/bin/node build/index.js` on port 3000. Supabase is a separate Docker Compose stack.
- AI chat/text generation uses OpenRouter (`openrouter/free` by default); no local Ollama/sidecar inference is intended. R&D members (role `RD`) manage the shared credential in Settings, stored server-side through Supabase Vault RPCs. Forge media, voice/audio, vector RAG and knowledge ingestion are removed. Live provider inference remains unverified until a key is configured and a real request succeeds.
- Shared server modules may also be imported by standalone workers. Avoid direct `$app/*` or `$env/*` imports in libraries used outside SvelteKit; use compatible configuration accessors.

## Current database contracts

- `draft_orders` is canonical; `orders` is an updatable view. `ordersummary` and `order_summary` are read views.
- Order child tables link through `draft_order_id`; `order_files` is only the file association table (`draft_order_id`, `file_id`, `file_type`, `display_name`). Metadata/storage properties belong to `files`.
- Before changing a database-facing path, inspect the current live schema and `pg_proc` signatures; migration files and stale notes are not definitive evidence.
- Role checks need to match the current profile role contract and RLS policies. A logged-in session alone does not authorize shared-data mutations.

## Development workflow

```sh
npm run test
npm run check
npm run build
npm run lint
```

The local Vitest runner is vendored in `packages/vitest`. Require all tests to pass and Svelte check to have zero errors; existing warnings may need separate prioritization. Re-run the gates after the final code or documentation edit if code changed.

## Service operations

For application-only changes, rebuild then restart only the OMS service; do not bounce database containers unnecessarily:

```sh
npm run build
sudo systemctl restart reclame-oms.service
systemctl is-active reclame-oms.service
curl --fail --silent --show-error http://localhost:3000/ -o /dev/null
journalctl -u reclame-oms.service -n 80 --no-pager
```

Build/restart does not apply migrations. Before running `npm run supabase:migrate:push`, confirm the target database, inspect migration SQL, take an appropriate backup, and verify role/RLS semantics.

## Code conventions

- Use Svelte 5 runes and the existing token-based design system.
- Validate at the API boundary; report structured and safe errors.
- Maintain the caller's API response contract when changing routes.
- Do not make undocumented changes to service configuration or secrets.

## Documentation policy

`README.md` is the current project overview. `MIGRATION_GUIDE.md` and `SVELTE5_MIGRATION_AUDIT.md` are historical references and must be checked against code before use. Avoid root-level temporary reports, obsolete plans, generated logs, and session notes; update maintained docs when contracts or operations change.