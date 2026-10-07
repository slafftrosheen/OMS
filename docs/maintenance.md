# Repository maintenance

## Current verification

Run from the repository root:

```sh
npm run test
npm run check
npm run build
git diff --check
```

Tests/build must pass and `svelte-check` must have zero errors. Existing warnings should be assessed when editing their components; the exact count changes over time.

## Current architecture contracts

- SvelteKit 2 / Svelte 5 with `@sveltejs/adapter-node`; production process is systemd `reclame-oms.service` in `/opt/reclame-oms`, port 3000.
- Supabase is a separate Docker service stack; application restart must not restart the DB containers.
- `draft_orders` is the canonical order table. `orders` is an updatable view; `ordersummary`/`order_summary` are read views.
- `order_files` is an association table. Its order FK is `draft_order_id`; file metadata/storage fields belong to `files`.
- `order_stages` uses `draft_order_id` and `station` with `state`.
- Confirm current RPC argument names and result types in the running database before changing callers.

## Migration safety

Review SQL, confirm the target database, back up where appropriate, and check the deployed role helper/policy meanings before any RLS or data migration. Build/restart never applies migrations implicitly.

## Documentation hygiene

Keep maintained architecture and operation instructions in README/agent guides. Do not check in temporary audit dumps, dated plans, session summaries, credentials, logs, or build artifacts. Historical migration/audit material must be clearly labeled as historical and revalidated against current code/schema before it is acted upon.

## Production refresh

```sh
npm run build
sudo systemctl restart reclame-oms.service
systemctl is-active reclame-oms.service
curl --fail --silent --show-error http://localhost:3000/ -o /dev/null
journalctl -u reclame-oms.service -n 80 --no-pager
```

Keep the Supabase containers untouched unless the release requires an explicitly reviewed database change.

## Deployment facts

Observed production unit: `reclame-oms.service`, working directory `/opt/reclame-oms`, env file `/opt/reclame-oms/.env`, command `/usr/bin/node build/index.js`, `PORT=3000`, `HOST=0.0.0.0`, configured `ORIGIN=http://100.93.111.19:3000`. The `.env` values are private and intentionally not documented here.