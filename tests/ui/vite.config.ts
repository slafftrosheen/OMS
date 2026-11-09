import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  define: {__OMS_BUILD_REVISION__: JSON.stringify('browser-fixture'), __OMS_BUILD_TIME__: JSON.stringify('2026-11-09T00:00:00.000Z')},
  root: path('./'),
  publicDir: path('../../static'),
  plugins: [svelte({ configFile: false })],
  resolve: {
    alias: {
      'svelte-i18n': path('../../packages/svelte-i18n/index.js'),
      '$lib': path('../../src/lib'),
      '$app/paths': path('../../src/app/paths.js'),
      '$app/environment': path('../../src/app/environment.js'),
      '$app/state': path('./app-state.ts'),
      '$app/stores': path('../../src/app/stores.js'),
      '$app/navigation': path('./navigation.ts'),
      '$env/dynamic/public': path('./env-public.ts')
    }
  },
  server: { host: '127.0.0.1', port: 4175, strictPort: true, fs: { allow: [path('../../')] } }
});
