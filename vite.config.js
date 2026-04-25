import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// LAN dev WebSocket host — fall back to a generic localhost when not set so
// non-Tailnet devs can spin up `npm run dev` without editing anything.
const HMR_HOST = process.env.VITE_HMR_HOST || process.env.FRONTEND_HOST || 'localhost';
const WS_PROXY_TARGET = process.env.PUBLIC_WS_URL || 'ws://localhost:8000';

export default defineConfig({
  plugins: [sveltekit()],
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
