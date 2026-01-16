# Supabase Migration Helper Script

This project includes a helper script to manage Supabase database migrations.

## Available Commands

### Create a new migration
```bash
# Using npm script
npm run supabase:migrate:create <migration_name>

# Or directly
bash scripts/supabase-migrate.sh create <migration_name>
```

This creates a new migration file in `supabase/migrations/` with a timestamp prefix.

### List migrations
```bash
# Using npm script
npm run supabase:migrate:list

# Or directly
bash scripts/supabase-migrate.sh list
```

This shows local migration files and applied migrations (if available locally).

### Push migrations to remote
```bash
# Using npm script
npm run supabase:migrate:push

# Or directly
bash scripts/supabase-migrate.sh push
```

This pushes local migrations to the remote Supabase database. Requires environment variables:
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

## GitHub Actions

The project also includes GitHub Actions workflows that automatically deploy database changes when migration files are updated. See [Supabase GitHub Actions Setup](./supabase-github-actions-setup.md) for configuration details.