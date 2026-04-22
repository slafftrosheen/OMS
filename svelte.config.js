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

    csp: {
      directives: {
        'connect-src': [
          "'self'",
          "http://192.168.8.150:54321",
          "ws://192.168.8.150:54321",
          "ws://192.168.8.151:5173"
        ]
      }
    },

    env: {
      publicPrefix: 'PUBLIC_'
    }
  }
};

export default config;
