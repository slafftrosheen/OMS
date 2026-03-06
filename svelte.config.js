import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isVercel = true;

console.log(`[svelte.config.js] Environment detection: isVercel=${isVercel}`);
console.log(`[svelte.config.js] Selected adapter: ${isVercel ? '@sveltejs/adapter-vercel' : '@sveltejs/adapter-node'}`);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess,

  kit: {
    adapter: adapterVercel({
      // Enable streaming for better performance
      streaming: true,
      // Precompress assets
      precompress: true,
      // Use a supported runtime version
      runtime: 'nodejs20.x'
    }),

    alias: {
      $lib: 'src/lib',
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $utils: 'src/lib/utils'
    },

    csrf: {
      checkOrigin: true
    },

    env: {
      publicPrefix: 'PUBLIC_'
    }
  }
};

export default config;
