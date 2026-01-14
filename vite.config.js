import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    rollupOptions: {
      external: ['bcrypt']
    }
  },
  test: {
    environment: 'jsdom'
  }
});
