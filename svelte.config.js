import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV === 'development';
const base = process.env.BASE_PATH || (dev ? '' : '/reclame_OMS');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // See https://github.com/sveltejs/kit/tree/main/packages/adapter-vercel#configuration
      runtime: 'nodejs20.x', // Specify Node.js runtime
      regions: ['fra1'], // Optional: specify regions
    }),
    paths: { base, relative: true },
    alias: {
      '$lib': 'src/lib',
      '$lib/*': 'src/lib/*'
    },
    prerender: {
      handleHttpError: 'warn',
      handleMissingId: 'warn',
      handleUnseenRoutes: 'warn'
    }
  }
};

export default config;
