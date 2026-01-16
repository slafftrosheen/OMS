import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV === 'development';
// Set base path based on environment variable, default to empty string for Vercel
// In production on Vercel, always use empty base path to serve from root
const base = process.env.NODE_ENV === 'production' && typeof process.env.VERCEL !== 'undefined'
  ? ''
  : (process.env.BASE_PATH || (dev ? '' : '/reclame_OMS'));

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // See https://github.com/sveltejs/kit/tree/main/packages/adapter-vercel#configuration
      runtime: 'nodejs20.x', // Specify Node.js runtime
      regions: ['fra1'], // Optional: specify regions
      // Add configuration for the edge runtime if needed
      // split: false // Set to true if you want to split the application into multiple functions
    }),
    paths: { base, relative: false }, // Changed relative to false for Vercel
    alias: {
      '$lib': 'src/lib',
      '$lib/*': 'src/lib/*'
    },
    prerender: {
      handleHttpError: 'warn',
      handleMissingId: 'warn',
      handleUnseenRoutes: 'warn'
    },
    trailingSlash: 'never' // Ensure consistent URL handling
  }
};

export default config;
