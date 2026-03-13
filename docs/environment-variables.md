# Environment Variables Documentation

This document lists all environment variables required for the OMS application.

## Required Environment Variables

### Supabase Configuration (Required)

These are the core environment variables needed for the application to function:

#### `PUBLIC_SUPABASE_URL`
- **Required**: Yes
- **Type**: String (URL)
- **Description**: Your Supabase project URL
- **Example**: `https://xyzcompany.supabase.co`
- **Where to find**: Supabase Dashboard → Project Settings → API → Project URL
- **Used in**:
  - Client-side authentication
  - Server-side API calls
  - Realtime subscriptions
- **Files**:
  - `src/lib/server/supabase.ts`
  - `src/lib/supabase-client.ts`
  - `src/hooks.server.ts`

#### `PUBLIC_SUPABASE_ANON_KEY`
- **Required**: Yes
- **Type**: String
- **Description**: Your Supabase project's anonymous (public) API key
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to find**: Supabase Dashboard → Project Settings → API → Project API keys → `anon` `public`
- **Used in**:
  - Client-side authentication
  - Public API access
  - Frontend operations
- **Files**:
  - `src/lib/server/supabase.ts`
  - `src/lib/supabase-client.ts`
  - `src/hooks.server.ts`

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Required**: Yes (for server-side operations)
- **Type**: String
- **Description**: Your Supabase project's service role key (admin key)
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to find**: Supabase Dashboard → Project Settings → API → Project API keys → `service_role` (⚠️ Keep this secret!)
- **⚠️ Security**: Never expose this key to the client side. Server-side only.
- **Used in**:
  - Server-side admin operations
  - Bypassing RLS policies when needed
  - Background jobs and cron tasks
- **Files**:
  - `src/lib/server/supabase-admin.ts`
  - `src/lib/server/supabase.ts`

### Legacy Environment Variables (Optional - for backwards compatibility)

#### `VITE_SUPABASE_URL`
- **Required**: No (use `PUBLIC_SUPABASE_URL` instead)
- **Type**: String (URL)
- **Description**: Legacy Vite-style environment variable for Supabase URL
- **Note**: The app will fall back to this if `PUBLIC_SUPABASE_URL` is not set
- **Files**:
  - `src/lib/supabase-client.ts`
  - `src/lib/notifications/realtime.ts`
  - `src/lib/chat/chat-store.ts`

#### `VITE_SUPABASE_ANON_KEY`
- **Required**: No (use `PUBLIC_SUPABASE_ANON_KEY` instead)
- **Type**: String
- **Description**: Legacy Vite-style environment variable for Supabase anon key
- **Note**: The app will fall back to this if `PUBLIC_SUPABASE_ANON_KEY` is not set
- **Files**:
  - `src/lib/supabase-client.ts`
  - `src/lib/notifications/realtime.ts`
  - `src/lib/chat/chat-store.ts`

#### `SUPABASE_URL`
- **Required**: No (use `PUBLIC_SUPABASE_URL` instead)
- **Type**: String (URL)
- **Description**: Alternative naming for Supabase URL
- **Note**: Provided for backwards compatibility

#### `SUPABASE_ANON_KEY`
- **Required**: No (use `PUBLIC_SUPABASE_ANON_KEY` instead)
- **Type**: String
- **Description**: Alternative naming for Supabase anon key
- **Note**: Provided for backwards compatibility

## Optional Environment Variables

### Application Configuration

#### `PUBLIC_APP_URL`
- **Required**: No
- **Type**: String (URL)
- **Default**: `http://localhost:5173`
- **Description**: The public URL where your application is hosted
- **Example**: `https://oms.yourcompany.com`
- **Used for**:
  - Email templates
  - OAuth redirects
  - Webhook URLs

#### `PUBLIC_APP_NAME`
- **Required**: No
- **Type**: String
- **Default**: `"OMS - Order Management System"`
- **Description**: The display name of your application
- **Used for**:
  - Email templates
  - Page titles
  - Branding

### Email Configuration (Optional)

#### `SMTP_HOST`
- **Required**: No (if email notifications are disabled)
- **Type**: String
- **Description**: SMTP server hostname
- **Example**: `smtp.gmail.com`

#### `SMTP_PORT`
- **Required**: No
- **Type**: Number
- **Default**: `587`
- **Description**: SMTP server port
- **Example**: `587` (TLS) or `465` (SSL)

#### `SMTP_USER`
- **Required**: No
- **Type**: String
- **Description**: SMTP authentication username
- **Example**: `your-email@gmail.com`

#### `SMTP_PASS`
- **Required**: No
- **Type**: String
- **Description**: SMTP authentication password
- **Example**: `your-app-password`
- **Note**: For Gmail, use an App Password, not your regular password

#### `SMTP_FROM`
- **Required**: No
- **Type**: String (email address)
- **Description**: The "from" email address for outgoing emails
- **Example**: `noreply@yourcompany.com`

### AI Features (Optional)

#### `DASHSCOPE_API_KEY`
- **Required**: No (if AI features are disabled)
- **Type**: String
- **Description**: API key for Dashscope AI services
- **Used for**: AI-powered features like suggestions and predictions

### PWA/Push Notifications (Optional)

#### `VITE_VAPID_PUBLIC_KEY`
- **Required**: No (if push notifications are disabled)
- **Type**: String
- **Description**: VAPID public key for web push notifications
- **Used in**: `src/lib/pwa/pwa-service.ts`

## Setting Environment Variables

### Local Development

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your actual values:
   ```bash
   # Required
   PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key

   # Optional
   PUBLIC_APP_URL=http://localhost:5173
   PUBLIC_APP_NAME="My Company OMS"
   ```

### Vercel Deployment

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable:
   - Variable name: `PUBLIC_SUPABASE_URL`
   - Value: Your Supabase URL
   - Environments: Production, Preview, Development (select as needed)
4. Repeat for all required variables

### GitHub Actions / CI/CD

Add environment variables as GitHub Secrets:

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each required variable as a secret

Example workflow usage:
```yaml
env:
  PUBLIC_SUPABASE_URL: ${{ secrets.PUBLIC_SUPABASE_URL }}
  PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.PUBLIC_SUPABASE_ANON_KEY }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## Troubleshooting

### Common Issues

#### "Missing PUBLIC_SUPABASE_URL" error
- **Cause**: The environment variable is not set or is empty
- **Solution**:
  1. Check your `.env` file exists and contains the variable
  2. Verify the variable name is exactly `PUBLIC_SUPABASE_URL` (case-sensitive)
  3. Restart your development server after adding the variable

#### "Invalid URL format" error
- **Cause**: The Supabase URL is malformed
- **Solution**:
  1. Ensure the URL starts with `https://`
  2. Remove any trailing slashes
  3. Copy the URL directly from Supabase dashboard

#### "Supabase credentials not configured" warning
- **Cause**: Variables are set but may have placeholder values
- **Solution**: Replace placeholder values with actual credentials from your Supabase project

#### Build succeeds but runtime fails
- **Cause**: Build-time placeholders are used but runtime credentials are missing
- **Solution**:
  1. Ensure environment variables are available at runtime
  2. For Vercel: Check that variables are added to the correct environment
  3. For Docker: Pass environment variables to the container

## Security Best Practices

1. **Never commit** `.env` files to version control
2. **Keep service role key secret** - never expose it to the client
3. **Use different keys** for development and production
4. **Rotate keys regularly** if they may have been compromised
5. **Use environment-specific variables** for different deployment stages
6. **Review Supabase RLS policies** to ensure proper data access control

## Where Variables Are Used

### Server-Side Only
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_*` variables
- `DASHSCOPE_API_KEY`

### Client and Server
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_APP_URL`
- `PUBLIC_APP_NAME`

### Client-Side Only
- `VITE_VAPID_PUBLIC_KEY`

## Additional Resources

- [Supabase Environment Variables](https://supabase.com/docs/guides/getting-started/local-development#environment-variables)
- [SvelteKit Environment Variables](https://kit.svelte.dev/docs/modules#$env-dynamic-public)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
