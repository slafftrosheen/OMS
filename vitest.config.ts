import { mergeConfig, defineConfig } from 'vitest/config';
import viteConfig from './vite.config.js';
import { fileURLToPath } from 'node:url';

export default mergeConfig(viteConfig, defineConfig({
  resolve: {
    alias: {
      '$env/dynamic/public': fileURLToPath(new URL('./tests/mocks/env-dynamic-public.ts', import.meta.url))
    }
  },
  ssr: {
    noExternal: ['pg'],
  },
}));
