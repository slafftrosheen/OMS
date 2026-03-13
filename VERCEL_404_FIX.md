# Fixing 404 Errors on Vercel Deployment

## Problem
You're seeing errors like:
```
DUVXYJNg.js:1  Failed to load resource: the server responded with a status of 404 ()
start.BJWOGSfC.js:1  Failed to load resource: the server responded with a status of 404 ()
Uncaught (in promise) TypeError: Failed to fetch dynamically imported module
```

## Root Cause
The Vercel deployment has an **incorrectly configured Output Directory**. This project uses `@sveltejs/adapter-vercel` which automatically outputs to `.vercel/output`, but if the Output Directory is manually set to `build` (or any other value), Vercel will look in the wrong location for the built files.

## Solution

### Step 1: Fix Vercel Project Settings

1. Go to your Vercel dashboard at https://vercel.com
2. Navigate to your project (oms-blush or similar)
3. Click on **Settings**
4. Go to **General** → **Build & Development Settings**
5. Find the **Output Directory** setting
6. **IMPORTANT**: Ensure it is set to:
   - Empty (no value)
   - OR the default (`.vercel/output` will be used automatically)
   - **DO NOT** set it to `build`, `dist`, or any custom value

### Step 2: Clear Build Cache

1. In the same Settings page, scroll down
2. Find **Build & Development Settings** section
3. Click **Clear Cache** or delete `.vercel` cache if the option is available

### Step 3: Redeploy

After fixing the settings:

**Option A: Trigger from Dashboard**
1. Go to **Deployments** tab
2. Click **Redeploy** on the latest deployment
3. Choose **Redeploy with Cache Cleared**

**Option B: Trigger from Git**
```bash
git commit --allow-empty -m "Trigger Vercel rebuild after config fix"
git push
```

### Step 4: Verify the Fix

1. Wait for the deployment to complete (check deployment logs)
2. Visit your site at `https://oms-blush.vercel.app` (or your domain)
3. Open browser DevTools (F12) → Console
4. Refresh the page
5. Verify there are no 404 errors for `.js` and `.css` files

## Why This Happens

When using `@sveltejs/adapter-vercel`:
- The build process creates `.vercel/output/` directory
- Inside are `static/`, `functions/`, and `config.json`
- Vercel automatically knows to serve from `.vercel/output/static/`
- Setting a custom Output Directory breaks this automatic behavior

## Configuration Files

### vercel.json (Correct)
```json
{
  "framework": "sveltekit",
  "buildCommand": "npm run build"
}
```

**Do NOT add** `outputDirectory` to vercel.json when using adapter-vercel.

### svelte.config.js (Correct)
```javascript
import adapterVercel from '@sveltejs/adapter-vercel';

const config = {
  kit: {
    adapter: adapterVercel()
  }
};
```

## Verification Checklist

After deploying, verify:
- [ ] No 404 errors in browser console
- [ ] Application loads and displays correctly
- [ ] Navigation between pages works
- [ ] Static assets (CSS, images) load properly
- [ ] JavaScript bundles load successfully

## Additional Resources

- [SvelteKit Vercel Adapter Docs](https://kit.svelte.dev/docs/adapter-vercel)
- [Vercel Build Configuration](https://vercel.com/docs/build-step)
- See also: `vercel_setup_guide.md` in this repository

## Troubleshooting

### Still seeing 404s after fix?

1. **Check deployment logs**: Look for build errors
2. **Verify adapter**: Confirm `@sveltejs/adapter-vercel` is installed
3. **Check node version**: Ensure Vercel is using Node 18 or higher
4. **Environment variables**: Verify all required env vars are set
5. **Contact support**: If issue persists, check Vercel support

### Build succeeds but 404s persist?

This indicates the Output Directory is still misconfigured:
- Double-check the setting is completely empty
- Try removing and re-adding the project to Vercel
- Verify the `.vercel` directory isn't committed to git

### Getting "Failed to fetch dynamically imported module"?

This is a symptom of the 404 errors. Fix the Output Directory setting and the dynamic imports will work correctly.
