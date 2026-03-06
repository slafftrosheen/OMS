import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: ['.']
    },
    proxy: {
        '/ws': {
            target: process.env.PUBLIC_WS_URL || 'ws://localhost:8000',
            ws: true
        }
    }
  },
  build: {
    rollupOptions: {
      // Only external libraries should be Node.js-specific modules
      // that cannot run in the browser.
      // - bcrypt: Node.js only, for server-side auth
      // - exceljs: Large library used in server-side export endpoint
      // - canvas: Node.js native module, used by qrcode (but we use svg mode/browser shim where possible)
      external: ['bcrypt', 'exceljs', 'canvas']
      // Removed manualChunks for chart.js as it conflicts with external
      // Vite will automatically handle chunking for browser libraries
    }
  }
});