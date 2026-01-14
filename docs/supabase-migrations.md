# Supabase Migrations Guide

This document explains how to manage database schema changes using Supabase migrations in this project.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed on your machine.
- Docker installed and running (for local development).

## Directory Structure

The `supabase/` directory contains all Supabase-related configuration and migrations.

```
supabase/
├── config.toml      # Supabase local development configuration
├── migrations/      # Database migration files (SQL)
│   ├── 20231201000000_init_schema.sql
│   ├── ...
└── seed.sql         # Seed data for local development
```

## Local Development

### 1. Start Supabase

Start the local Supabase stack (PostgreSQL, Studio, Edge Functions, etc.):

```bash
supabase start
```

This command will also apply any pending migrations to your local database.

### 2. Creating a Migration

To create a new migration, use the `supabase migration new` command:

```bash
supabase migration new <migration_name>
```

Example:

```bash
supabase migration new add_priority_to_orders
```

This will create a new SQL file in `supabase/migrations/` with a timestamp prefix.

### 3. Writing SQL

Edit the newly created SQL file to include your database changes.

Example:

```sql
ALTER TABLE draft_orders ADD COLUMN priority VARCHAR(20) DEFAULT 'NORMAL';
```

### 4. Applying Migrations Locally

Migrations are automatically applied when you run `supabase start` or `supabase db reset`.

To apply pending migrations to your running local instance without resetting:

```bash
supabase migration up
```

To reset the local database (wiping data) and re-apply all migrations and seeds:

```bash
supabase db reset
```

## Deployment

### 1. Link to Remote Project

First, link your local environment to your remote Supabase project:

```bash
supabase link --project-ref <your-project-ref>
```

You can find your project reference ID in the Supabase Dashboard URL (e.g., `https://supabase.com/dashboard/project/abcdefghijklm`).

### 2. Push Migrations

To apply your local migrations to the remote production database:

```bash
supabase db push
```

**Note:** This command will apply any new migrations that haven't been applied to the remote database yet. It ensures your production schema matches your local schema.

## Troubleshooting

- **Migration conflicts:** If you and another developer created migrations at the same time, you might have conflicts. Ensure your migration timestamps are ordered correctly.
- **Failed migrations:** If a migration fails, fix the SQL in the file and run `supabase db reset` locally to try again.

## Reference

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
- [Managing Database Migrations](https://supabase.com/docs/guides/cli/managing-environments)
