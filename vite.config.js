import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: [
        // Allow serving files from the project root
        '.',
        // explicit packages folder
        'packages'
      ]
    },
    // Proxy removed for /api to let SvelteKit handle it
    proxy: {
        // '/api': {
        //     target: process.env.PUBLIC_API_URL || 'http://localhost:8000',
        //     changeOrigin: true
        // },
        '/ws': {
            target: process.env.PUBLIC_WS_URL || 'ws://localhost:8000',
            ws: true
        }
    }
  },
  build: {
    rollupOptions: {
      external: ['bcrypt', 'exceljs']
    }
  },
  test: {
    environment: 'jsdom'
  }
});