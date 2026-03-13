# Deployment Fix Instructions

## 1. Update Dependencies
```bash
npm install @sveltejs/adapter-vercel@latest
npm install
```

## 2. Run Database Migrations
```bash
# Connect to your Supabase project
npx supabase db push

# Or manually run the migration SQL in Supabase Dashboard
```

## 3. Clear Vercel Cache
In Vercel Dashboard:
- Go to Settings > General
- Scroll to "Build & Development Settings"
- Delete the .vercel cache

## 4. Environment Variables
Ensure these are set in Vercel:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- (any other environment variables)

## 5. Redeploy
```bash
git add .
git commit -m "Fix: Vercel deployment and add profile presets"
git push
```

## 6. Verify Build
Check Vercel build logs for:
✓ Adapter configuration
✓ No module not found errors
✓ Successful build completion

## Common Issues
- If still seeing module errors: Clear .svelte-kit and node_modules, reinstall
- If migration fails: Check Supabase connection and permissions
- If presets don't load: Verify RLS policies are enabled