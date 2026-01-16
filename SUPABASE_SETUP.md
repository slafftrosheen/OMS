# Supabase Setup Instructions

## Prerequisites
- Supabase CLI installed and authenticated (`supabase login`)
- Your Supabase project reference (looks like a string of letters/numbers)

## Step 1: Link to Your Remote Project
```bash
cd /home/server/OMS
supabase link --project-ref YOUR_PROJECT_REFERENCE_HERE
```

Replace `YOUR_PROJECT_REFERENCE_HERE` with your actual project reference.

## Step 2: Push Database Schema to Remote
After linking, push the database schema:

```bash
supabase db push
```

This will apply all the migration files in the `supabase/migrations/` directory to your remote database.

## Step 3: Create the First Admin User
Once the database is set up, you can create the first admin user by following the instructions in the admin user creation guide:

```bash
# View the guide
cat scripts/create_admin_user_guide.md
```

## Alternative: If You Want to Test Locally (Requires Docker)

If you want to run the database locally for testing:

1. Make sure Docker is running:
   ```bash
   sudo systemctl start docker  # On Ubuntu/Debian
   # Or start Docker Desktop on Mac/Windows
   ```

2. Start the local Supabase development setup:
   ```bash
   supabase start
   ```

3. Push the schema to the local database:
   ```bash
   supabase db push
   ```

4. Stop the local setup when done:
   ```bash
   supabase stop
   ```

## Important Notes

- The database schema includes tables for profiles, files, draft orders, materials, user preferences, and audit logs
- Row Level Security (RLS) policies are configured for user data protection
- The system is designed to work with Supabase Auth for user management
- All migration files in the `supabase/migrations/` directory will be applied in chronological order

## Troubleshooting

If you encounter issues:
- Make sure you're using the correct project reference
- Verify that you have the necessary permissions in your Supabase project
- Check that your Supabase CLI is up to date (`supabase --version`)