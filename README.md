# Réclame Fabriek OMS

SvelteKit order-management and production workflow application with a self-hosted Supabase backend. The repository also contains Reclame AI Lab interfaces and services.

## Runtime architecture

- Frontend/API: SvelteKit 2 + Svelte 5 + TypeScript, built with `@sveltejs/adapter-node`.
- Database/auth/storage: self-hosted Supabase (PostgreSQL, PostgREST, Auth, Storage, Realtime, Edge Functions).
- Orders: `draft_orders` is canonical; `orders` is an updatable view. `ordersummary` and `order_summary` are read views.
- Files: `files` owns file metadata/storage keys; `order_files` links `draft_order_id` to `file_id` and carries `file_type`/`display_name`.
- Workflow: `order_stages` links to `draft_orders` through `draft_order_id`.
- Unit tests use the repository-local Vitest package at `packages/vitest`; no network service is needed for unit tests.

Check live DB schema/functions before relying on old migration-era assumptions.

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

The AI node addresses are configuration-dependent; don't assume an old deployment IP is current. If health-check logs report unavailable AI services, verify configured node addresses and Tailscale peer reachability before changing code.

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