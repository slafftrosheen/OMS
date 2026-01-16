# Vercel Environment Configuration

This document explains how to properly configure environment variables for the OMS project on Vercel.

## Required Environment Variables

The application requires the following environment variables to be set in your Vercel project:

### Supabase Configuration (Required)
- `PUBLIC_SUPABASE_URL`: Your Supabase project URL (public)
- `PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon key (public) 
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (private)

### Runtime Availability

For each environment variable, you need to specify when it should be available:

- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`: 
  - ✅ **Include at runtime** (checked)
  - Available during both build and runtime

- `SUPABASE_SERVICE_ROLE_KEY`: 
  - ❌ **Include at runtime** (unchecked - default)
  - Available only during build time, not exposed to client

## How to Set Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Navigate to Settings → Environment Variables
4. Add the following variables:

| Key | Value | Include at Runtime |
|-----|-------|-------------------|
| `PUBLIC_SUPABASE_URL` | Your Supabase project URL | ✅ Checked |
| `PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | ✅ Checked |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | ❌ Unchecked |

## How to Get Your Supabase Keys

1. Go to your Supabase dashboard
2. Navigate to Project Settings → API
3. You'll find:
   - `anon key` (for `PUBLIC_SUPABASE_ANON_KEY`)
   - `service_role key` (for `SUPABASE_SERVICE_ROLE_KEY`)
   - The project URL is in the format: `https://[project_ref].supabase.co`

## Verification

After setting the environment variables:

1. Redeploy your project
2. The build should complete successfully
3. The application should connect to your Supabase database

## Troubleshooting

If you still encounter issues:

1. Verify that all three environment variables are correctly set
2. Check that the "Include at runtime" option is set appropriately for each variable
3. Make sure there are no extra spaces or characters in the values
4. Redeploy the project after making changes to environment variables