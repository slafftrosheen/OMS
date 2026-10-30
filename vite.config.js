import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';

dotenv.config();

// LAN dev WebSocket host — fall back to a generic localhost when not set so
// non-Tailnet devs can spin up `npm run dev` without editing anything.
const HMR_HOST = process.env.VITE_HMR_HOST || process.env.FRONTEND_HOST || 'localhost';

// Air-gapped self-hosted deploy — never phone home with source maps unless
// SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are all explicitly set.
const SENTRY_UPLOAD =
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT;

// Capture build provenance when Vite actually compiles the client/server bundle.
// A git pull or service restart without a rebuild cannot update these values.
function currentSourceRevision() {
  try {
    const revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (/^[0-9a-f]{7,12}$/i.test(revision)) return revision;
  } catch {
    // Docker contexts might omit .git; use a supplied deploy SHA if available.
  }
  const candidate = process.env.OMS_SOURCE_REVISION || process.env.GITHUB_SHA || '';
  return /^[0-9a-f]{7,40}$/i.test(candidate) ? candidate.slice(0, 12) : 'unknown';
}
const OMS_BUILD_REVISION = currentSourceRevision();
const OMS_BUILD_TIME = new Date().toISOString();

export default defineConfig({
  define: {
    __OMS_BUILD_REVISION__: JSON.stringify(OMS_BUILD_REVISION),
    __OMS_BUILD_TIME__: JSON.stringify(OMS_BUILD_TIME)
  },
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: Boolean(SENTRY_UPLOAD),
      sourceMapsUploadOptions: SENTRY_UPLOAD
        ? {
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN
          }
        : undefined,
      // autoInstrument pulls in @babel/preset-typescript at runtime, which
      // is a devDependency not present in the deployed node_modules. We rely
      // on Sentry.sentryHandle() in hooks.server.ts for route-level tracing.
      autoInstrument: false
    }),
    sveltekit()
  ],
  server: {
    host: true,
    strictPort: true,
    hmr: { host: HMR_HOST },
    fs: { allow: ['.'] }
  },
  build: {
    rollupOptions: {
      // Node-only modules that should never reach the browser bundle.
      external: ['exceljs', 'canvas']
    }
  }
});
