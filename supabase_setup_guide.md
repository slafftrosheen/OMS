# Supabase Setup Guide for OMS Project

## Prerequisites

Before setting up Supabase for the OMS project, ensure you have:

1. A Supabase account (sign up at [supabase.com](https://supabase.com))
2. The Supabase CLI installed:
   ```bash
   # Using npm
   npm install -g supabase
   
   # Or using Homebrew (macOS)
   brew install supabase/tap/supabase
   
   # Or using curl (Linux/macOS)
   curl -fsSL https://cli.supabase.com/install.sh | sh
   ```

## Step 1: Create a New Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Enter a project name (e.g., "oms-project")
4. Choose a region closest to your users
5. Set a secure database password
6. Click "Create new project"

Wait for the project to be provisioned (this may take a few minutes).

## Step 2: Link Your Local Project to the Remote Supabase Project

1. In your terminal, navigate to the OMS project directory:
   ```bash
   cd /home/server/OMS
   ```

2. Login to Supabase CLI:
   ```bash
   supabase login
   ```

3. Link your local project to the remote Supabase project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REFERENCE
   ```
   
   Replace `YOUR_PROJECT_REFERENCE` with your actual project reference. You can find this in your project's dashboard URL or settings page.

## Step 3: Apply Existing Database Migrations

The OMS project already has migration files in the `/supabase/migrations` directory. To apply these migrations to your remote database:

1. Make sure you're in the OMS project directory:
   ```bash
   cd /home/server/OMS
   ```

2. Push the migrations to your remote database:
   ```bash
   supabase db push
   ```

This will apply all the migration files in the correct order to your remote Supabase database.

## Step 4: Set Up Environment Variables

After creating your Supabase project, you'll need to get the following values from your project dashboard:

1. Go to your Supabase project dashboard
2. Navigate to "Project Settings" → "API"
3. Copy the following values:
   - **Project URL** → This will be your `PUBLIC_SUPABASE_URL`
   - **anon key** → This will be your `PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → This will be your `SUPABASE_SERVICE_ROLE_KEY`

Update your environment files with these values:

### For local development (.env file):
```env
PUBLIC_SUPABASE_URL=your_project_url
PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### For Vercel deployment:
You'll add these same values in the Vercel project settings later.

## Step 5: Configure Authentication Settings

1. In your Supabase dashboard, go to "Authentication" → "Settings"
2. Configure the following:
   - Set your site URL (e.g., your-vercel-domain.vercel.app)
   - Add redirect URLs for your deployed application
   - Configure email templates if needed

## Step 6: Verify Database Schema

After applying migrations, verify that your database schema matches what's expected by the application:

1. Go to the "SQL Editor" in your Supabase dashboard
2. Run a query to verify key tables exist:
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

You should see tables like `profiles`, `files`, `draft_orders`, `materials`, `user_preferences`, and `audit_log`.

## Troubleshooting

If you encounter issues with the migration:

1. Check that your local `supabase/config.toml` matches the remote database version
2. Make sure you have the correct permissions for the service role key
3. Verify that the migration files are properly formatted

## Next Steps

Once your Supabase project is set up and configured:

1. Proceed with Vercel frontend deployment
2. Set up GitHub Actions for automated deployments
3. Test the complete setup

Remember to keep your service role key secure and never expose it in client-side code.