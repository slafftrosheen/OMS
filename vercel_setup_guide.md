# Vercel Setup Guide for OMS Project

## Prerequisites

Before deploying your OMS project to Vercel, ensure you have:

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. The Vercel CLI installed (optional but useful):
   ```bash
   npm i -g vercel
   ```

## Method 1: Deploy via Vercel Dashboard (Recommended)

### Step 1: Link Your GitHub Repository
1. Go to [vercel.com](https://vercel.com) and log in
2. Click "Add New..." → "Project"
3. Select your GitHub account and find the OMS repository
4. Click "Import" to add the project to Vercel

### Step 2: Configure Project Settings
1. In the "Configure Project" step, ensure the following settings:
   - Framework Preset: SvelteKit (should be detected automatically)
   - Root Directory: `/` (root of your project)
   - Build Command: `npm run build` (detected automatically)
   - Output Directory: `build` (from adapter-static)
   - Install Command: `npm install` (detected automatically)

### Step 3: Add Environment Variables
Click on "Environment Variables" and add the following:

| Key | Value |
|-----|-------|
| `PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |

⚠️ **Important**: Only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` should be marked as "Include at runtime". The `SUPABASE_SERVICE_ROLE_KEY` should only be available during build time, so leave it without the "Include at runtime" checkbox checked.

### Step 4: Deploy
1. Click "Deploy" to start the deployment process
2. Wait for the build to complete (this may take a few minutes)
3. Once complete, you'll receive a deployment URL

## Method 2: Deploy via Vercel CLI

### Step 1: Install and Login
```bash
npm i -g vercel
vercel login
```

### Step 2: Pull Project Configuration
```bash
cd /home/server/OMS
vercel pull --yes
```

### Step 3: Deploy with Environment Variables
```bash
vercel --env PUBLIC_SUPABASE_URL=your_supabase_url --env PUBLIC_SUPABASE_ANON_KEY=your_anon_key --env SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Custom Domain Setup (Optional)

If you want to use a custom domain:

1. Go to your project dashboard on Vercel
2. Navigate to "Settings" → "Domains"
3. Add your custom domain
4. Follow the DNS configuration instructions

## Post-Deployment Configuration

### Configure Supabase Authentication Redirects
After deployment, you'll need to add your Vercel deployment URL to Supabase allowed redirect URLs:

1. Go to your Supabase dashboard
2. Navigate to "Authentication" → "URL Configuration"
3. Add your Vercel deployment URL to:
   - Redirect URLs
   - Site URL
   - Additional Redirect URLs (if needed)

Example: `https://your-project-name.vercel.app`

## Troubleshooting

### Common Issues:

1. **Build fails**: Check that all environment variables are properly set
2. **Supabase connection fails**: Verify that your Supabase URL and keys are correct
3. **Static adapter issues**: Make sure your SvelteKit app can work with static generation

### Debugging Tips:
- Check the Vercel deployment logs for specific error messages
- Ensure your app doesn't rely on server-only features that won't work with static generation
- Verify that all routes can be prerendered or handle SSR appropriately

## Environment Variables Reference

The OMS project requires the following environment variables:

- `PUBLIC_SUPABASE_URL`: Your Supabase project URL (public)
- `PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon key (public)
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (private, for server-side operations)

## Next Steps

Once your Vercel deployment is successful:

1. Set up GitHub Actions for automated deployments (see GitHub Actions setup guide)
2. Test the complete setup with your Supabase backend
3. Configure any additional features you need