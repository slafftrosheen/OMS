import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
        '/api': {
            target: process.env.PUBLIC_API_URL || 'http://localhost:8000',
            changeOrigin: true
        },
        '/ws': {
            target: process.env.PUBLIC_WS_URL || 'ws://localhost:8000',
            ws: true
        }
    }
  },
  build: {
    rollupOptions: {
      external: ['bcrypt', 'exceljs'],
      output: {
        manualChunks: {
            'chart': ['chart.js']
        }
      }
    }
  },
  test: {
    environment: 'jsdom'
  }
});