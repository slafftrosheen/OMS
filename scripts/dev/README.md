# scripts/dev

One-off and developer-only utilities. **Not** part of the runtime.

| File | Purpose |
|---|---|
| `verify_connection.js` | Smoke-tests the Supabase connection from the dev box. |
| `seed_db.js` | Inserts demo orders / users for local exploration. |
| `test_schema.sql` | Read-only assertions used to spot-check a DB after a migration. |
| `insert_thickness_data.sql` | Legacy seed for `material_thickness_options`. Superseded by migration `20260213104305`; kept for reference. |

If you add a script here, add a row to this table.
