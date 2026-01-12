# Configuration

Environment variables and application settings for Reclame OMS.

## Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```bash
cp .env.example .env
```

### Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | `localhost` | PostgreSQL server hostname |
| `DB_PORT` | No | `5432` | PostgreSQL server port |
| `DB_NAME` | Yes | `reclame_oms` | Database name |
| `DB_USER` | Yes | `reclame_admin` | Database user |
| `DB_PASSWORD` | Yes | - | Database password |

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reclame_oms
DB_USER=reclame_admin
DB_PASSWORD=your_secure_password_here
```

### Application Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUBLIC_PREF_SYNC_ENDPOINT` | No | - | External preference sync URL |
| `NODE_ENV` | No | `development` | Environment mode |

```env
PUBLIC_PREF_SYNC_ENDPOINT=
NODE_ENV=production
```

## Connection Pool Configuration

Database connection pool settings in `src/lib/server/db/connection.ts`:

```typescript
const pool = new Pool({
  host: env.DB_HOST || 'localhost',
  port: parseInt(env.DB_PORT || '5432'),
  database: env.DB_NAME || 'reclame_oms',
  user: env.DB_USER || 'reclame_admin',
  password: env.DB_PASSWORD,
  
  // Pool configuration
  max: 20,                      // Maximum connections
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 2000  // Fail connection after 2s
});
```

### Tuning for Production

| Setting | Development | Production | Description |
|---------|-------------|------------|-------------|
| `max` | 10 | 20-50 | Max pool connections |
| `idleTimeoutMillis` | 30000 | 60000 | Idle timeout |
| `connectionTimeoutMillis` | 2000 | 5000 | Connection timeout |

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

## Production Configuration Checklist

### Security

- [ ] **Set strong `DB_PASSWORD`:** Ensure that the database password is strong and has been changed from the default.
- [ ] **Enable `secure: true` for cookies:** Ensure that the `secure` flag is enabled for all cookies in a production environment.
- [ ] **Update default user password hashes:** Ensure that all default user password hashes have been updated.
- [ ] **Remove Placeholder Passwords:** Remove any placeholder or default passwords for all users.
- [ ] **Configure firewall rules for database:** Configure the firewall to restrict network access to the database.

### Performance

- [ ] **Tune connection pool size for load:** Tune the connection pool size to handle the expected load.
- [ ] **Enable PostgreSQL connection pooler (PgBouncer):** Enable a PostgreSQL connection pooler such as PgBouncer to improve performance.
- [ ] **Configure appropriate indexes:** Configure appropriate indexes to improve database performance.

### Monitoring

- [ ] **Set up database connection monitoring:** Set up monitoring for database connections to identify and resolve any issues.
- [ ] **Configure error logging:** Configure error logging to capture and analyze any errors that occur.
- [ ] **Set up health check endpoints:** Set up health check endpoints to monitor the health of the application.

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

### svelte.config.js

```javascript
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      '$lib': './src/lib'
    }
  }
};

export default config;
```

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

### Database Connection Issues

```bash
# Test connection
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c '\q'

# Check PostgreSQL status
systemctl status postgresql

# View PostgreSQL logs
tail -f /var/log/postgresql/postgresql-14-main.log
```

### Environment Variable Issues

```bash
# Verify environment variables are loaded
node -e "console.log(process.env.DB_HOST)"

# Check .env file is being read
npm run dev -- --verbose
```

### Session Issues

```sql
-- View active sessions
SELECT * FROM user_sessions WHERE expires_at > NOW();

-- Clear expired sessions
DELETE FROM user_sessions WHERE expires_at <= NOW();

-- Force logout all users
TRUNCATE user_sessions;
```
