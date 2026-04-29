import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// LAN dev WebSocket host — fall back to a generic localhost when not set so
// non-Tailnet devs can spin up `npm run dev` without editing anything.
const HMR_HOST = process.env.VITE_HMR_HOST || process.env.FRONTEND_HOST || 'localhost';
const WS_PROXY_TARGET = process.env.PUBLIC_WS_URL || 'ws://localhost:8000';

// Air-gapped self-hosted deploy — never phone home with source maps unless
// SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are all explicitly set.
const SENTRY_UPLOAD =
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT;

export default defineConfig({
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
      autoInstrument: true
    }),
    sveltekit()
  ],
  server: {
    host: true,
    strictPort: true,
    hmr: { host: HMR_HOST },
    fs: { allow: ['.'] },
    proxy: {
      '/ws': { target: WS_PROXY_TARGET, ws: true }
    }
  },
  build: {
    rollupOptions: {
      // Node-only modules that should never reach the browser bundle.
      external: ['exceljs', 'canvas']
    }
  }
});
