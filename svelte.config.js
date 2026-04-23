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

    // csrf configuration removed as checkOrigin is deprecated

    csp: {
      directives: {
        'connect-src': [
          "'self'",
          "http://192.168.8.150:54321",
          "https://192.168.8.150:54321",
          "ws://192.168.8.150:54321",
          "wss://192.168.8.150:54321",
          "ws://192.168.8.151:5173",
          "http://100.93.147.108:11434",
          "http://100.98.202.69:54322",
          "ws://100.98.202.69:54322",
          "http://100.98.202.69:54321",
          "https://100.98.202.69:54321",
          "ws://100.98.202.69:54321",
          "wss://100.98.202.69:54321"
        ]
      }
    },

    env: {
      publicPrefix: 'PUBLIC_'
    }
  }
};

export default config;
