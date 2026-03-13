# Fixing Vercel Deployment Issues

If you're experiencing "Not Found" errors after deploying to Vercel, follow these steps:

## Issue
The application shows "Not Found" when accessed via the Vercel URL.

## Root Cause
The SvelteKit application was configured with a base path of `/reclame_OMS`, which causes all routes to be prefixed with this path. When deployed to Vercel without the proper base path configuration, the application looks for resources under the wrong path.

## Solution

### 1. Verify Environment Variables in Vercel
Make sure the following environment variable is set in your Vercel project:

- `BASE_PATH` = "" (empty string)

To set this:
1. Go to your Vercel dashboard
2. Navigate to your project
3. Go to Settings → Environment Variables
4. Add a new variable:
   - Key: `BASE_PATH`
   - Value: (leave empty for root path)
   - Check "Production" and "Preview" environments

### 2. Redeploy the Application
After setting the environment variable:

1. Go to your project deployments in Vercel
2. Click "Deployments" tab
3. Click the "Redeploy" button for the latest commit
4. This will rebuild the application with the correct base path

### 3. Alternative: Trigger New Deployment
You can also trigger a new deployment by pushing an empty commit:

```bash
git commit --allow-empty -m "Trigger rebuild with correct BASE_PATH"
git push origin main
```

## Verification
After redeployment:
1. Wait for the build to complete
2. Visit your Vercel URL
3. The application should now load correctly

## Additional Notes
- The `BASE_PATH` environment variable overrides the default behavior in `svelte.config.js`
- When `BASE_PATH` is empty, the application serves from the root path `/`
- When `BASE_PATH` is set to a value like `/myapp`, the application serves from `/myapp/`