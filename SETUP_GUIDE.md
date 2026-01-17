# Environment Setup Guide

This guide details the environment setup, secrets, permissions, and requirements for the OMS project.

## 1. Requirements

### Local Development
*   **Node.js**: Version 20.x (as specified in `.github/workflows/vercel-deploy.yml` and `svelte.config.js`).
*   **Supabase CLI**: For local database management and migrations (optional but recommended).
*   **Vercel CLI**: For deployment management (optional).

### Deployment
*   **Vercel**: Used for hosting the SvelteKit application.
*   **Supabase**: Used for Database (PostgreSQL), Authentication, and Storage.
*   **GitHub Actions**: Used for CI/CD.

## 2. Environment Variables (Application Runtime)

These variables are required for the application to run. They should be set in `.env` for local development and in the Vercel project settings for production.

| Variable | Description | Location |
| :--- | :--- | :--- |
| `PUBLIC_SUPABASE_URL` | The URL of your Supabase project. | `.env` / Vercel |
| `PUBLIC_SUPABASE_ANON_KEY` | The anonymous public key for Supabase. | `.env` / Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role key for admin operations (Keep Secret!). | `.env` / Vercel (Do not expose to client) |
| `SESSION_SECRET` | A long, random string used for session encryption. | `.env` / Vercel |
| `DASHSCOPE_API_KEY` | (Optional) API key for Qwen AI integration. | `.env` / Vercel |
| `QWEN_API_BASE_URL` | (Optional) Base URL for Qwen AI API. | `.env` / Vercel |
| `QWEN_MODEL` | (Optional) Model selection for Qwen AI. | `.env` / Vercel |
| `MAX_FILE_SIZE` | (Optional) Max file upload size in bytes (default 50MB). | `.env` / Vercel |
| `ALLOWED_FILE_TYPES` | (Optional) Allowed file extensions for upload. | `.env` / Vercel |
| `UPLOAD_DIR` | (Optional) Upload directory path. | `.env` / Vercel |
| `NODE_ENV` | Environment mode (`development` or `production`). | `.env` / Vercel |
| `PUBLIC_BASE_PATH` | Base path for the application (usually empty or `/reclame_OMS` for GH Pages). | `.env` / Vercel |
| `VITE_API_URL` | URL for the API (e.g., `http://localhost:5173` locally). | `.env` / Vercel |
| `DEBUG` | Enable debug mode (`true`/`false`). | `.env` / Vercel |

## 3. GitHub Secrets (CI/CD)

These secrets must be added to your GitHub repository settings (`Settings` -> `Secrets and variables` -> `Actions`) for the workflows to function correctly.

### Vercel Deployment (`.github/workflows/vercel-deploy.yml`)

| Secret Name | Description |
| :--- | :--- |
| `VERCEL_ORG_ID` | The ID of your Vercel Organization (found in Vercel project settings). |
| `VERCEL_PROJECT_ID` | The ID of your Vercel Project (found in Vercel project settings). |
| `VERCEL_TOKEN` | A personal access token from Vercel to allow deployment. |

### Supabase Deployment (`.github/workflows/supabase-deploy.yml`)

| Secret Name | Description |
| :--- | :--- |
| `SUPABASE_ACCESS_TOKEN` | A personal access token from Supabase for CLI access. |
| `SUPABASE_DB_PASSWORD` | The password for your Supabase project's database. |
| `SUPABASE_PROJECT_ID` | The Reference ID of your Supabase project. |

## 4. Permissions & Configuration

### Vercel
1.  **Project Settings**:
    *   Framework Preset: SvelteKit
    *   Root Directory: `/`
    *   Build Command: `npm run build`
    *   Output Directory: `build` (for `adapter-static`) or `.vercel/output` (for `adapter-vercel`). *Note: The project uses `adapter-vercel`.*
2.  **Environment Variables**: Add all variables listed in Section 2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is **NOT** exposed to the browser (unchecked "Available to Browser" if that option exists, or handled via server-side code).

### Supabase
1.  **Auth**: Configure Authentication providers (Email/Password, etc.) and redirect URLs (e.g., `https://your-project.vercel.app/auth/callback`).
2.  **Storage**: Ensure a storage bucket named `files` exists (or as configured in code).
3.  **Database**: The `supabase-deploy.yml` workflow will handle migrations if configured correctly.

### GitHub
1.  **Actions**: Ensure GitHub Actions are enabled for the repository.
2.  **Secrets**: Add the secrets listed in Section 3.
