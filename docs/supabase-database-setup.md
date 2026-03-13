# Supabase Database Setup Guide

This document explains how to properly set up the Supabase database for the OMS application.

## Database Schema

The application expects the following tables to be present in your Supabase database:

1. `profiles` - User profiles extending auth.users
2. `files` - File management table
3. `profile_templates` - Profile template definitions
4. `draft_orders` - Draft order management
5. `order_profiles` - Order profile associations
6. `materials` - Material definitions
7. `user_preferences` - User preferences
8. `audit_log` - Audit logging
9. Various other tables for inventory, calendar, notifications, etc.

## Migration Setup

### Option 1: Using Supabase CLI (Recommended)

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project:
   ```bash
   supabase link --project-ref your_project_id
   ```

3. Set the remote database password:
   ```bash
   supabase db remote set --password your_db_password
   ```

4. Push the migrations:
   ```bash
   supabase db push
   ```

### Option 2: Manual Setup

If you prefer to set up the database manually:

1. Connect to your Supabase database using a PostgreSQL client
2. Execute the migration files in order from `supabase/migrations/` directory
3. The files are named with timestamps to ensure proper execution order

### Option 3: Using the provided script

Run the migration script from the project root:
```bash
bash scripts/migrate_to_supabase.sh
```

## Seeding Data

To seed the database with initial data:

1. The seed file `supabase/seed.sql` contains initial user data
2. This will be automatically applied when you run `supabase db push`
3. Or you can manually execute it against your database

## Environment Variables

Make sure the following environment variables are set in your Vercel project:

- `PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

## Troubleshooting

### Common Issues:

1. **Table does not exist**: Run the migrations to create the required tables
2. **Permission denied**: Check that your service role key has proper permissions
3. **Connection failed**: Verify your Supabase URL and keys are correct

### Verifying Setup:

To verify that your database is properly set up:

1. Check that all tables from the migration files exist
2. Verify that Row Level Security (RLS) policies are enabled where needed
3. Test basic CRUD operations through the application

## RLS Policies

The application uses Row Level Security for data protection. Make sure RLS is enabled on the following tables:
- `profiles`
- `draft_orders`
- `files`
- And others as defined in the migration files