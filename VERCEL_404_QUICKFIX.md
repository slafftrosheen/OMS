# Quick Fix: Vercel 404 Errors

## 🔴 Problem
Getting these errors in browser console:
```
Failed to load resource: the server responded with a status of 404
start.BJWOGSfC.js:1
app.DqvQf_ZJ.js:1
```

## ✅ Solution (2 minutes)

### Step 1: Fix Vercel Settings
1. Open https://vercel.com
2. Go to your project → **Settings** → **General**
3. Scroll to **Build & Development Settings**
4. Find **Output Directory**
5. **Set it to EMPTY** (completely blank, no value)
6. Save changes

### Step 2: Redeploy
Option A: Dashboard
- Go to **Deployments** → Click **Redeploy** → Choose **Clear cache**

Option B: Git push
```bash
git commit --allow-empty -m "Trigger Vercel rebuild"
git push
```

### Step 3: Verify
- Wait for deployment to finish
- Visit your site
- Open DevTools (F12) → Console
- Refresh page
- Should see NO 404 errors

## 📋 Why This Works
- Project uses `@sveltejs/adapter-vercel`
- Adapter outputs to `.vercel/output/` automatically
- Setting custom Output Directory breaks this
- Solution: Leave Output Directory empty/blank

## 📚 More Details
See `VERCEL_404_FIX.md` for complete troubleshooting guide.

## ⚠️ Common Mistakes
- ❌ Setting Output Directory to `build`
- ❌ Setting Output Directory to `dist`
- ❌ Setting Output Directory to `.vercel/output`
- ✅ Leave Output Directory **completely empty**

## Need Help?
1. Check deployment logs in Vercel dashboard
2. Verify adapter in `svelte.config.js` is `@sveltejs/adapter-vercel`
3. See full guide: `VERCEL_404_FIX.md`
