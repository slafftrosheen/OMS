# Configuration

Environment variables and application settings for Reclame OMS.

## Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```bash
cp .env.example .env
```

### Supabase Configuration (Required)

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (public) |
| `PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (public) |
| `SUPABASE_URL` | Yes | Supabase project URL (server) |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only, never expose) |

```env
# Supabase Configuration
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> ⚠️ **Security**: Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client. It bypasses Row Level Security.

### Application Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_APP_URL` | No | `http://localhost:5173` | Application base URL |
| `PUBLIC_APP_NAME` | No | `OMS` | Application display name |
| `NODE_ENV` | No | `development` | Environment mode |

```env
PUBLIC_APP_URL=http://localhost:5173
PUBLIC_APP_NAME="OMS - Order Management System"
NODE_ENV=production
```

### Email Configuration (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | - | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASS` | No | - | SMTP password |
| `SMTP_FROM` | No | - | Email sender address |

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourcompany.com
```

### S3/Storage Configuration (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `S3_ENDPOINT` | No | - | S3-compatible endpoint URL |
| `S3_REGION` | No | `us-east-1` | S3 region |
| `S3_BUCKET` | No | - | S3 bucket name |
| `S3_ACCESS_KEY_ID` | No | - | S3 access key |
| `S3_SECRET_ACCESS_KEY` | No | - | S3 secret key |
| `S3_PUBLIC_URL` | No | - | Public CDN URL for files |

```env
S3_ENDPOINT=https://your-minio-or-s3.com
S3_REGION=us-east-1
S3_BUCKET=oms-files
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_PUBLIC_URL=https://cdn.yoursite.com
```

## Session Configuration

Session settings in `src/routes/api/auth/+server.ts`:

```typescript
cookies.set('session', token, {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60  // 7 days in seconds
});
```

### Session Duration

| Setting | Value | Description |
|---------|-------|-------------|
| Default | 7 days | Session cookie lifetime |
| Database | 7 days | `expires_at` in user_sessions |

To change session duration:

```typescript
// 24 hours
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

// 30 days
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
```

## Internationalization

### Supported Locales

| Code | Language |
|------|----------|
| `en` | English (default) |
| `ru` | Russian |
| `lv` | Latvian |

### Adding a New Locale

1. Create translation file:

```bash
touch src/locales/de.json
```

2. Add translations:

```json
{
  "common": {
    "save": "Speichern",
    "cancel": "Abbrechen"
  }
}
```

3. Register in `src/lib/i18n.ts`:

```typescript
const SUPPORTED_LOCALES = ['en', 'ru', 'lv', 'de'] as const;

register('de', () => import('../locales/de.json'));
```

## Theme Configuration

### Available Themes

| Theme | Description |
|-------|-------------|
| `LightVim` | Light mode with vim-inspired colors |
| `DarkVim` | Dark mode (default) |
| `HighContrast` | High contrast for accessibility |

### CSS Custom Properties

Themes are defined via CSS custom properties in `src/app.css`:

```css
:root[data-theme="DarkVim"] {
  --bg-0: #1e1e1e;
  --bg-1: #252525;
  --text: #d4d4d4;
  --border: #404040;
  --primary: #569cd6;
  --error: #f44747;
  /* ... */
}

:root[data-theme="LightVim"] {
  --bg-0: #ffffff;
  --bg-1: #f5f5f5;
  --text: #333333;
  /* ... */
}
```

### Adding a Custom Theme

1. Define CSS variables:

```css
:root[data-theme="CustomTheme"] {
  --bg-0: #your-color;
  --bg-1: #your-color;
  /* ... */
}
```

2. Add to theme store:

```typescript
// src/lib/stores/theme.ts
export type ThemeName = 'LightVim' | 'DarkVim' | 'HighContrast' | 'CustomTheme';
```

## UI Scale Configuration

### Available Scales

| Scale | Font Size | Use Case |
|-------|-----------|----------|
| `sm` | 14px | Compact displays |
| `md` | 16px | Default |
| `lg` | 18px | Better readability |
| `xl` | 20px | Accessibility |

### CSS Implementation

```css
:root {
  --rf-font-size: 16px;
}

:root[data-scale="sm"] { --rf-font-size: 14px; }
:root[data-scale="lg"] { --rf-font-size: 18px; }
:root[data-scale="xl"] { --rf-font-size: 20px; }

body {
  font-size: var(--rf-font-size);
}
```

## Database Seeding

To seed the database with initial data (materials, admin user, etc.):

1.  Set the `SEED_ADMIN_PASSWORD` environment variable to a strong password.
2.  Run the seed script: `bash scripts/run_seed.sh`.
3.  The script will generate a temporary SQL file with your password substituted.
4.  Follow the instructions output by the script to execute the SQL in your Supabase project.

```bash
export SEED_ADMIN_PASSWORD="your_strong_password_here"
bash scripts/run_seed.sh
```

## Production Configuration Checklist

### Security

- [ ] **Configure Supabase RLS:** Ensure Row Level Security is enabled on all tables
- [ ] **Protect service role key:** Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code
- [ ] **Enable `secure: true` for cookies:** Ensure that the `secure` flag is enabled for all cookies in production
- [ ] **Update default user passwords:** Ensure all seeded user passwords are changed via Supabase Dashboard
- [ ] **Review Supabase Auth settings:** Configure password policies and auth providers in Supabase Dashboard

### Performance

- [ ] **Enable Supabase connection pooling:** Use Supabase's built-in connection pooling (Supavisor)
- [ ] **Configure appropriate indexes:** Create indexes for frequently queried columns
- [ ] **Enable caching:** Configure edge caching for static assets

### Monitoring

- [ ] **Enable Supabase logging:** Review logs in Supabase Dashboard > Logs
- [ ] **Configure error logging:** Set up error monitoring with Sentry or similar
- [ ] **Set up health check endpoints:** Monitor application health and Supabase connectivity

## Troubleshooting Configuration Issues

### Invalid `.env` file

- **Symptom:** The application fails to start or some environment variables are not being set correctly.
- **Solution:** Ensure that the `.env` file is in the root of the project and that it is formatted correctly.

### Incorrect database connection details

- **Symptom:** The application is unable to connect to the database.
- **Solution:** Check that the database connection details in the `.env` file are correct.

### Incorrect file permissions

- **Symptom:** The application is unable to read or write to a file.
- **Solution:** Check that the file permissions are correct.

## SvelteKit Configuration

The application uses adaptive deployment based on environment:

### svelte.config.js

```javascript
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_URL;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: isVercel
      ? adapterVercel()
      : adapterNode({
          out: 'build',
          precompress: true,
          envPrefix: ''
        }),
    alias: {
      '$lib': './src/lib'
    }
  }
};

export default config;
```

**Deployment adapters:**
- **Vercel**: Automatically uses `@sveltejs/adapter-vercel` when deployed to Vercel
- **Self-hosted**: Uses `@sveltejs/adapter-node` for Node.js deployment

### vite.config.js

```javascript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    host: true
  }
});
```

## Troubleshooting

### Supabase Connection Issues

```bash
# Test Supabase connection (requires curl)
curl -H "apikey: YOUR_ANON_KEY" \
  "https://your-project.supabase.co/rest/v1/"

# Check if environment variables are set
node -e "console.log('SUPABASE_URL:', !!process.env.SUPABASE_URL)"
```

### Common Issues

**"Invalid API key" error:**
- Verify `PUBLIC_SUPABASE_ANON_KEY` matches your Supabase project settings

**"Row Level Security policy violation" error:**
- Ensure RLS policies are configured correctly for the affected table
- Check if the user has the required permissions

### Environment Variable Issues

```bash
# Verify environment variables are loaded
node -e "console.log('SUPABASE_URL:', !!process.env.SUPABASE_URL)"

# Check .env file is being read
npm run dev -- --verbose
```

### Session Issues

With Supabase Auth, sessions are managed by Supabase. To troubleshoot:

1. Check Supabase Dashboard > Authentication > Users for user status
2. Review auth logs in Supabase Dashboard > Logs
3. Clear local storage in browser to reset client-side session
