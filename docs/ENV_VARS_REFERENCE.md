# Environment Variables Quick Reference

## ✅ Required Variables

Copy these to your `.env` file and replace with your actual Supabase values:

```bash
PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📍 Where to Find Your Values

Go to: **[Supabase Dashboard](https://app.supabase.com/project/_/settings/api)**

| Variable | Dashboard Location | Example Value |
|----------|-------------------|---------------|
| `PUBLIC_SUPABASE_URL` | **Project URL** section | `https://xyzcompany.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | **Project API keys** → `anon` `public` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5emNvbXBhbnkiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxMjQ3MjQwMCwiZXhwIjoxOTI4MDQ4NDAwfQ.xyz` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys** → `service_role` ⚠️ | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5emNvbXBhbnkiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjEyNDcyNDAwLCJleHAiOjE5MjgwNDg0MDB9.xyz` |

⚠️ **Warning:** Keep `service_role` key secret! Never expose to client-side code.

## 📁 Where Variables Are Used

### Server-Side Files (Backend)

These files use `SUPABASE_SERVICE_ROLE_KEY` (admin access):

```
src/lib/server/supabase-admin.ts
src/lib/server/supabase.ts
src/hooks.server.ts
```

### Client & Server Files

These files use `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`:

```
src/lib/supabase-client.ts
src/lib/server/supabase.ts
src/hooks.server.ts
src/lib/chat/chat-store.ts
src/lib/notifications/realtime.ts
```

## 🔧 Variable Name Reference

The codebase checks for these variable names (in order of priority):

### For Supabase URL:
1. ✅ `PUBLIC_SUPABASE_URL` (recommended, SvelteKit standard)
2. `VITE_SUPABASE_URL` (legacy, Vite standard)
3. `SUPABASE_URL` (backwards compatibility)

### For Anonymous Key:
1. ✅ `PUBLIC_SUPABASE_ANON_KEY` (recommended, SvelteKit standard)
2. `VITE_SUPABASE_ANON_KEY` (legacy, Vite standard)
3. `SUPABASE_ANON_KEY` (backwards compatibility)

### For Service Role Key:
1. ✅ `SUPABASE_SERVICE_ROLE_KEY` (required, server-side only)

**Recommendation:** Use the `PUBLIC_*` versions for new projects. The others are kept for backwards compatibility.

## 🚀 Quick Setup Commands

```bash
# 1. Copy example file
cp .env.example .env

# 2. Edit .env with your editor
nano .env
# or
code .env

# 3. Paste your values from Supabase Dashboard

# 4. Restart dev server
npm run dev
```

## ✅ Verification Checklist

After setting up, verify:

- [ ] `.env` file exists in project root
- [ ] All three required variables are set
- [ ] URLs start with `https://` (no trailing slash)
- [ ] Keys are complete JWT tokens (start with `eyJ`)
- [ ] Dev server starts without errors
- [ ] Browser console shows: `[Supabase] Initializing client`
- [ ] No "Missing PUBLIC_SUPABASE_URL" errors

## 🔒 Security Checklist

- [ ] `.env` is in `.gitignore` (never commit!)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-side only
- [ ] Using different keys for dev/staging/production
- [ ] No hardcoded credentials in source code
- [ ] Environment variables set in hosting platform

## 📚 Full Documentation

For complete details, see:
- **Quick Setup:** [docs/QUICK_SETUP.md](./QUICK_SETUP.md)
- **All Variables:** [docs/environment-variables.md](./environment-variables.md)

## 🐛 Common Issues

### "Missing PUBLIC_SUPABASE_URL"
→ Check `.env` exists and contains the variable. Restart dev server.

### "Invalid URL format"
→ Ensure URL starts with `https://` with no trailing slash or spaces.

### "Supabase credentials not configured"
→ Replace placeholder values with actual credentials from dashboard.

### Works locally but fails in production
→ Set environment variables in your hosting platform (Vercel/Netlify/etc).

## 💡 Pro Tips

1. **Use placeholder values during build:** The app automatically uses placeholders during build to prevent crashes. Real values are only needed at runtime.

2. **Test locally first:** Always test with your actual credentials locally before deploying.

3. **Different projects for dev/prod:** Use separate Supabase projects for development and production.

4. **Rotate keys if compromised:** If you accidentally expose your service role key, rotate it immediately in Supabase Dashboard.

5. **Check RLS policies:** Ensure your Supabase Row Level Security policies are properly configured for production use.
