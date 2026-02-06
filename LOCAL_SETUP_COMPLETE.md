# OMS Local Deployment Setup - Complete! ✅

## What's Running

### 1. **Supabase Local Stack** (http://127.0.0.1:54321)
All backend services are running locally via Docker:
- **Studio UI**: http://127.0.0.1:54323 (Database management)
- **Database**: postgresql://postgres:postgres@127.0.0.1:54322/postgres
- **API**: http://127.0.0.1:54321/rest/v1
- **Mailpit** (email testing): http://127.0.0.1:54324

### 2. **OMS Application** (http://localhost:5173)
SvelteKit development server with hot-reload

---

## Quick Commands

### Start Everything
```bash
cd /home/slaff/OMS

# Start Supabase (if not running)
sg docker -c "supabase start"

# Start development server (in a new terminal or detached)
npm run dev
```

### Stop Everything
```bash
# Stop development server
# (Ctrl+C if running in terminal, or find and kill process)

# Stop Supabase
cd /home/slaff/OMS
sg docker -c "supabase stop"
```

### Useful Commands
```bash
# Check Supabase status
cd /home/slaff/OMS
sg docker -c "supabase status"

# View database in Studio
# Open: http://127.0.0.1:54323

# View logs
cd /home/slaff/OMS
sg docker -c "supabase logs"

# Reset database (WARNING: deletes all data)
cd /home/slaff/OMS
sg docker -c "supabase db reset"
```

---

## Environment Configuration

Your `.env` file is configured for local development:
```
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
PUBLIC_APP_URL=http://localhost:5173
```

---

## Access Points

1. **Main Application**: http://localhost:5173
2. **Supabase Studio** (DB Admin): http://127.0.0.1:54323
3. **Email Testing (Mailpit)**: http://127.0.0.1:54324
4. **API Docs**: http://127.0.0.1:54321

---

## Database Credentials

```
Host: 127.0.0.1
Port: 54322
Database: postgres
User: postgres
Password: postgres
```

---

## Troubleshooting

### App not loading?
```bash
# Check development server logs
ps aux | grep "vite dev"
```

### Database issues?
```bash
# Restart Supabase
cd /home/slaff/OMS
sg docker -c "supabase stop"
sg docker -c "supabase start"
```

### Port conflicts?
Edit `supabase/config.toml` to change default ports if needed

---

## Next Steps

1. **Open the app**: http://localhost:5173
2. **Create your first user** via the signup page
3. **Explore Supabase Studio**: http://127.0.0.1:54323
   - View tables
   - Run SQL queries
   - Check Row Level Security policies

---

## Development Tips

- All code changes auto-reload (Vite HMR)
- Database migrations are in `supabase/migrations/`
- To create a new migration: `sg docker -c "supabase migration new <name>"`
- Test emails appear in Mailpit: http://127.0.0.1:54324

---

## Production Notes

For production deployment:
1. Use a real Supabase project (https://app.supabase.com)
2. Update `.env` with production credentials
3. Deploy to Vercel/Node.js/Docker (see README.md)

---

## File Fixes Applied

Fixed SSR compatibility issue in:
- `src/lib/pwa/sync-manager.ts` - Added browser check for `navigator.onLine`

---

**Setup Date**: 2026-02-04
**Completed By**: GitHub Copilot CLI
