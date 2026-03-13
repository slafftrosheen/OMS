## Setting up Supabase GitHub Actions

This project includes GitHub Actions workflows to automatically deploy database schema changes to your Supabase project when migration files are updated.

### Required GitHub Secrets

To use the Supabase deployment workflow, you need to configure the following secrets in your GitHub repository:

1. `SUPABASE_PROJECT_ID`: Your Supabase project ID
   - Find this in your Supabase dashboard URL: `https://app.supabase.com/project/<PROJECT_ID>`

2. `SUPABASE_DB_PASSWORD`: Your Supabase database password
   - Go to Project Settings → Database → Connection String to find this

3. `SUPABASE_ACCESS_TOKEN`: (Optional but recommended) Your Supabase access token for the CLI
   - Generate at https://supabase.com/dashboard/account/tokens
   - If you have a token to add, store it securely as a GitHub Secret rather than hardcoding it anywhere

### How it Works

The workflow will:
- Monitor for changes in `supabase/migrations/`, `supabase/seed.sql`, and `supabase/config.toml`
- When changes are detected, it will push the schema changes to your remote Supabase database
- For pull requests, it validates the migration files locally

### Setup Steps

1. Go to your GitHub repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add the required secrets mentioned above
4. The workflow will automatically run on pushes to the main branch when database files are changed

### Security Note

Never commit access tokens or passwords directly to your codebase. Always use GitHub Secrets to store sensitive information like the `SUPABASE_ACCESS_TOKEN`. The token you have should be added to your GitHub repository's secrets section, not stored in any file.