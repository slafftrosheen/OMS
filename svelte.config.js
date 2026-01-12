import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV === 'development';
const base = process.env.BASE_PATH || (dev ? '' : '/reclame_OMS');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: '404.html' }),
    paths: { base, relative: true },
    prerender: { 
      handleHttpError: 'warn',
      handleMissingId: 'warn',
      handleUnseenRoutes: 'warn'
    }
  }
};

export default config;
