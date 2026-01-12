import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
const resolvePath = (relative) => fileURLToPath(new URL(relative, import.meta.url));

const svelteUntrackShim = {
  name: 'svelte-untrack-shim',
  resolveId(source) {
    if (/^svelte\/src\/runtime\/index(?:\.js)?$/.test(source)) {
      return resolvePath('./src/shims/svelte-runtime-index.js');
    }
    if (/^svelte\/src\/runtime\/ssr(?:\.js)?$/.test(source)) {
      return resolvePath('./src/shims/svelte-runtime-ssr.js');
    }
    return null;
  }
};

export default defineConfig({
  plugins: [svelteUntrackShim, sveltekit()],
  server: {
    fs: {
      allow: ['.', './packages']
    }
  },
  resolve: {
    alias: [
      {
        find: /^svelte\/src\/runtime\/index(?:\.js)?$/,
        replacement: resolvePath('./src/shims/svelte-runtime-index.js')
      },
      {
        find: /^svelte\/src\/runtime\/ssr(?:\.js)?$/,
        replacement: resolvePath('./src/shims/svelte-runtime-ssr.js')
      }
    ]
  },
  test: {
    environment: 'jsdom'
  }
});
