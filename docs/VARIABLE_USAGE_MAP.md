# Environment Variables Usage Map

This document shows exactly where each environment variable is used in the codebase.

## 🔑 Required Variables

### `PUBLIC_SUPABASE_URL`

**Purpose:** Your Supabase project URL  
**Example:** `https://xyzcompany.supabase.co`  
**Exposed to:** Client & Server

**Used in:**
```
✓ src/lib/server/supabase.ts (line 19, 43)
✓ src/lib/server/supabase-admin.ts (line 8-11)
✓ src/lib/supabase-client.ts (line 5)
✓ src/hooks.server.ts (line 16)
✓ src/lib/chat/chat-store.ts (line ~35, uses import.meta.env.VITE_SUPABASE_URL as fallback)
✓ src/lib/notifications/realtime.ts (line ~10, uses import.meta.env.VITE_SUPABASE_URL as fallback)
```

**Fallback chain:**
1. `PUBLIC_SUPABASE_URL` (recommended)
2. `VITE_SUPABASE_URL` (legacy)
3. `SUPABASE_URL` (backwards compatibility)
4. `process.env.PUBLIC_SUPABASE_URL`
5. Placeholder value during build: `https://placeholder.supabase.co`

---

### `PUBLIC_SUPABASE_ANON_KEY`

**Purpose:** Supabase anonymous/public API key  
**Example:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`  
**Exposed to:** Client & Server  
**Security:** ✅ Safe to expose (it's public by design)

**Used in:**
```
✓ src/lib/server/supabase.ts (line 20, 44)
✓ src/lib/supabase-client.ts (line 6)
✓ src/hooks.server.ts (line 17)
✓ src/lib/chat/chat-store.ts (line ~36, uses import.meta.env.VITE_SUPABASE_ANON_KEY as fallback)
✓ src/lib/notifications/realtime.ts (line ~11, uses import.meta.env.VITE_SUPABASE_ANON_KEY as fallback)
```

**Fallback chain:**
1. `PUBLIC_SUPABASE_ANON_KEY` (recommended)
2. `VITE_SUPABASE_ANON_KEY` (legacy)
3. `SUPABASE_ANON_KEY` (backwards compatibility)
4. `process.env.PUBLIC_SUPABASE_ANON_KEY`
5. Placeholder value during build: `placeholder-key`

---

### `SUPABASE_SERVICE_ROLE_KEY`

**Purpose:** Supabase service role key (admin privileges)  
**Example:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`  
**Exposed to:** Server-side ONLY  
**Security:** ⚠️ KEEP SECRET - Never expose to client

**Used in:**
```
✓ src/lib/server/supabase-admin.ts (line 14-17)
✓ src/lib/server/supabase.ts (line 20, fallback for admin client)
```

**Fallback chain:**
1. `SUPABASE_SERVICE_ROLE_KEY`
2. `process.env.SUPABASE_SERVICE_ROLE_KEY`
3. Placeholder value during build: `placeholder-key`

---

## 📦 Optional Variables

### `PUBLIC_APP_URL`

**Purpose:** The public URL where your app is hosted  
**Example:** `https://oms.yourcompany.com`  
**Default:** `http://localhost:5173`

**Used in:**
- Email templates (for links back to app)
- OAuth redirects
- Webhook callback URLs

---

### `PUBLIC_APP_NAME`

**Purpose:** Display name of your application  
**Example:** `"My Company OMS"`  
**Default:** `"OMS - Order Management System"`

**Used in:**
- Page titles
- Email templates
- Branding elements

---

### Email Configuration

#### `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

**Purpose:** Email notification configuration  
**Required:** Only if you want to send email notifications

**Used in:**
```
✓ src/lib/server/email-service.ts
✓ src/lib/server/email-triggers.ts
✓ src/lib/server/email/NotificationScheduler.ts
```

---

### AI Features

#### `DASHSCOPE_API_KEY`

**Purpose:** API key for Dashscope AI services  
**Required:** Only if you want AI-powered features

**Used in:**
```
✓ src/lib/server/analytics/AnalyticsService.ts (for predictions)
```

---

### Push Notifications

#### `VITE_VAPID_PUBLIC_KEY`

**Purpose:** VAPID public key for web push notifications  
**Required:** Only if you want push notifications

**Used in:**
```
✓ src/lib/pwa/pwa-service.ts
```

---

## 🔍 How Variables Are Loaded

### SvelteKit Environment Variables

SvelteKit has specific rules for environment variables:

1. **`PUBLIC_*` variables:**
   - Available in client and server code
   - Exposed to the browser
   - Imported from `$env/dynamic/public` or `$env/static/public`

2. **Non-PUBLIC variables:**
   - Server-side only
   - Never exposed to the browser
   - Imported from `$env/dynamic/private` or `$env/static/private`

### Loading Priority

Most files use this loading pattern:

```typescript
// Example from src/lib/server/supabase.ts
const getEnv = (key: string, fallback: string = '') => {
  const val =
    (env && env[key]) ||                        // 1. SvelteKit public env
    (private_env && (private_env as any)[key]) || // 2. SvelteKit private env
    (process?.env && process.env[key]);         // 3. Node.js process.env
  return val || fallback;                       // 4. Fallback value
};
```

This ensures variables work in:
- Development (`npm run dev`)
- Build time (`npm run build`)
- Production runtime (Vercel, Netlify, etc.)

---

## 📊 Variable Usage Summary

| Variable | Client | Server | Files | Security Level |
|----------|--------|--------|-------|----------------|
| `PUBLIC_SUPABASE_URL` | ✅ | ✅ | 6 | �� Public |
| `PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | 5 | 🟢 Public |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | ✅ | 2 | 🔴 Secret |
| `SMTP_*` | ❌ | ✅ | 3 | 🟡 Sensitive |
| `DASHSCOPE_API_KEY` | ❌ | ✅ | 1 | 🟡 Sensitive |
| `VITE_VAPID_PUBLIC_KEY` | ✅ | ❌ | 1 | 🟢 Public |

---

## 🔒 Security Guidelines

### DO ✅
- Use `PUBLIC_*` prefix for client-safe variables
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only
- Use different keys for dev/staging/production
- Store secrets in `.env` file (never commit)
- Set environment variables in hosting platform

### DON'T ❌
- Expose `SUPABASE_SERVICE_ROLE_KEY` to client
- Hardcode credentials in source code
- Commit `.env` file to version control
- Use production keys in development
- Share service role keys in public channels

---

## 🧪 Testing Variable Loading

To verify variables are loaded correctly:

```bash
# 1. Set variables in .env
PUBLIC_SUPABASE_URL=https://test.supabase.co
PUBLIC_SUPABASE_ANON_KEY=test-key
SUPABASE_SERVICE_ROLE_KEY=test-service-key

# 2. Run dev server
npm run dev

# 3. Check browser console
# Should see: [Supabase] Initializing client with URL: https://test...

# 4. Check server logs
# Should NOT see "Missing PUBLIC_SUPABASE_URL" errors
```

---

## 📚 Related Documentation

- **Quick Setup:** [QUICK_SETUP.md](./QUICK_SETUP.md)
- **Full Reference:** [environment-variables.md](./environment-variables.md)
- **Quick Reference:** [ENV_VARS_REFERENCE.md](./ENV_VARS_REFERENCE.md)
- **Example File:** [../.env.example](../.env.example)

---

## 🐛 Debugging

If variables aren't loading:

1. **Check file exists:** `.env` in project root
2. **Check variable names:** Must match exactly (case-sensitive)
3. **Check for spaces:** No spaces around `=` sign
4. **Restart server:** Variables are loaded on startup
5. **Check build vs runtime:** Some variables only work at runtime
6. **Check platform:** Hosting platforms need variables set separately

**Debug command:**
```bash
# See what Node sees
node -e "console.log(process.env)" | grep SUPABASE
```

---

Last Updated: 2026-02-02
