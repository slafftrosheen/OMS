import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess,

  kit: {
    adapter: adapterNode({
      // Precompress assets for better performance
      precompress: true
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
