# Quick Setup Guide for Supabase Environment Variables

This is a quick reference for setting up your environment variables. For comprehensive documentation, see [environment-variables.md](./environment-variables.md).

## Minimal Setup (Required)

You need these 3 environment variables at minimum:

```bash
PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Where to Find These Values

### 1. Go to Your Supabase Dashboard

Visit: https://app.supabase.com/project/_/settings/api

### 2. Copy These Values:

| Variable | Location in Dashboard | Example |
|----------|----------------------|---------|
| `PUBLIC_SUPABASE_URL` | Project URL | `https://xyzcompany.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | Project API keys → `anon` `public` | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys → `service_role` ⚠️ | `eyJhbGci...` |

**⚠️ WARNING**: Keep the `service_role` key secret! Never expose it to the client or commit it to public repositories.

## Setup Steps

### Local Development

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and paste your values:
   ```bash
   PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5emNvbXBhbnkiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxMjQ3MjQwMCwiZXhwIjoxOTI4MDQ4NDAwfQ.randomchars
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5emNvbXBhbnkiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjEyNDcyNDAwLCJleHAiOjE5MjgwNDg0MDB9.randomchars
   ```

3. Restart your development server:
   ```bash
   npm run dev
   ```

### Vercel Deployment

1. Go to: https://vercel.com/[your-username]/[your-project]/settings/environment-variables

2. Add each variable:
   - Click "Add New"
   - Name: `PUBLIC_SUPABASE_URL`
   - Value: [paste your URL]
   - Select environments: Production, Preview, Development
   - Click "Save"

3. Repeat for:
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. Redeploy your application

### Other Platforms

#### Netlify
Settings → Build & deploy → Environment → Environment variables

#### Railway
Project → Variables → New Variable

#### Docker
Pass as environment variables:
```bash
docker run -e PUBLIC_SUPABASE_URL=https://... -e PUBLIC_SUPABASE_ANON_KEY=... ...
```

Or in `docker-compose.yml`:
```yaml
environment:
  - PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
  - PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
  - SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

## Verification

After setting up, verify your configuration:

1. Check the browser console for: `[Supabase] Initializing client with URL: https://xyz...`

2. If you see errors like:
   - ❌ "Missing PUBLIC_SUPABASE_URL" → Variable not set or misspelled
   - ❌ "Invalid URL format" → URL is malformed (check for extra spaces/characters)
   - ❌ "Supabase credentials not configured" → Variables are set but may have placeholder values

3. If everything works:
   - ✅ Application loads without errors
   - ✅ Authentication works
   - ✅ Data loads from Supabase

## Troubleshooting

### Problem: "Missing PUBLIC_SUPABASE_URL"

**Solution**:
1. Check `.env` file exists in project root
2. Variable name is exactly `PUBLIC_SUPABASE_URL` (case-sensitive)
3. Restart your dev server after adding variables

### Problem: App works locally but fails in production

**Solution**:
1. Check environment variables are set in your hosting platform
2. Make sure you selected the correct environment (Production vs Preview)
3. Redeploy after adding variables

### Problem: "Invalid URL format"

**Solution**:
1. Ensure URL starts with `https://`
2. Remove any trailing slashes
3. Remove any extra spaces or quotes
4. Copy directly from Supabase dashboard

## Security Checklist

- [ ] `.env` file is in `.gitignore` (don't commit it!)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never exposed to client
- [ ] Using different keys for development and production
- [ ] Environment variables are set in hosting platform
- [ ] No hardcoded credentials in source code

## Next Steps

- ✅ Set up environment variables
- ✅ Verify application works
- 📖 Read [environment-variables.md](./environment-variables.md) for optional variables
- 🔒 Review [Supabase RLS policies](https://supabase.com/docs/guides/auth/row-level-security)
- 🚀 Deploy your application

## Getting Help

If you're still having issues:

1. Check the full documentation: [environment-variables.md](./environment-variables.md)
2. Review Supabase logs: https://app.supabase.com/project/_/logs/explorer
3. Check the console for error messages
4. Verify your Supabase project is active and not paused

## Quick Copy-Paste Template

```bash
# Copy this to your .env file and replace with your actual values

PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGci... (copy from Supabase dashboard)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... (copy from Supabase dashboard - keep secret!)

# Optional - for better compatibility
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_ANON_KEY=eyJhbGci... (same as PUBLIC_SUPABASE_ANON_KEY)
```
