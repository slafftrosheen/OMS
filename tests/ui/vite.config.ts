import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('./'),
  publicDir: path('../../static'),
  plugins: [svelte({ configFile: false })],
  resolve: {
    alias: {
      '$lib': path('../../src/lib'),
      '$app/paths': path('../../src/app/paths.js'),
      '$app/environment': path('../../src/app/environment.js')
    }
  },
  server: { host: '127.0.0.1', port: 4175, strictPort: true, fs: { allow: [path('../../')] } }
});
