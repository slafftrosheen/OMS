# Supabase database

SQL migrations are stored in `supabase/migrations/` and applied in timestamp order. The production Supabase Docker stack runs independently of the `reclame-oms.service` application service.

## Inspect and apply

```sh
npm run supabase:migrate:list
npm run supabase:migrate:push
```

Before applying: confirm the selected `DATABASE_URL` environment without exposing credentials, inspect the migration SQL, back up data for destructive or policy changes, and verify role/RLS behavior. A successful app build or service restart does not apply migrations.

## Current schema notes

- `draft_orders` is canonical; `orders` is an updatable view.
- `ordersummary` and `order_summary` are order read views.
- Order child relations use `draft_order_id` where established by the live schema.
- `files` stores file metadata and storage details; `order_files` links files to orders.

Use the live database schema and function definitions as the final authority. Do not infer current deployed state solely from old migration comments or documentation.