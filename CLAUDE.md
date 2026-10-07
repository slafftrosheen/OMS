# Developer Guide — Réclame Fabriek OMS

## Project and runtime

This repository contains a SvelteKit 2 / Svelte 5 TypeScript application and self-hosted Supabase integration for signage order intake and production workflows. The production OMS service runs as systemd unit `reclame-oms.service` from `/opt/reclame-oms`, serves port 3000, and reads the untracked root `.env`. Supabase runs in separate Docker containers.

## Current data contracts

- `draft_orders` is the canonical order table. `orders` is an updatable view; `ordersummary` and `order_summary` are read views.
- `order_profiles`, `order_stages`, and `order_files` use `draft_order_id` for the order relationship.
- `order_files` is a junction containing `draft_order_id`, `file_id`, `file_type`, and `display_name`. File metadata and storage fields belong in `files`.
- Use the live database schema/functions and current generated types as contract evidence. Historical migrations and older docs may be stale.
- `OrderStatus` in `src/lib/auth/permission-utils.ts` uses canonical uppercase lifecycle strings. Avoid lowercase literals and verify transitions against the current order workflow.
- Order-file, stage, change-request, search, QR and analytics paths have tests/contracts under `src/lib/**` and `tests/`.

## Common commands

```sh
npm run dev
npm run test
npm run check
npm run build
npm run lint
```

The test runner is the local vendored package in `packages/vitest`. `npm run check` is the Svelte/type diagnostic gate; warnings may remain, but zero errors is required for a clean check. Build output is generated under `build/` for adapter-node.

## Editing and validation

- Trace full client → SvelteKit route → service/RPC → live table/view contract before changing cross-layer behavior.
- Validate user inputs server-side; do not assume frontend constraints or an authenticated-session guard implies sufficient authorization.
- Preserve the existing Svelte 5 rune patterns (`$state`, `$derived`, `$props`, `$effect`) and token-based styles.
- For database authorization changes, review RLS predicates and helper-function role semantics before applying migrations.
- Run focused tests first, then the full `npm run test`, `npm run check`, `npm run build`, and `git diff --check` on the final tree.

## Production operations

The OMS app can be rebuilt and restarted independently of Supabase:

```sh
npm run build
sudo systemctl restart reclame-oms.service
systemctl is-active reclame-oms.service
curl --fail --silent --show-error http://localhost:3000/ -o /dev/null
journalctl -u reclame-oms.service -n 80 --no-pager
```

Do not apply migrations implicitly during build/restart. Confirm the target DB, review and back up data before `npm run supabase:migrate:push`. Never stage or commit `.env`, keys, tokens, or local credentials.

## Source of truth for docs

`README.md` describes current architecture and operational commands. `MIGRATION_GUIDE.md` and `SVELTE5_MIGRATION_AUDIT.md` are historical references; verify claims against present code and schema. Keep plans, audit findings, and dated execution notes out of the root unless they remain current, actionable, and maintained.