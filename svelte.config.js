import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isVercel = process.env.VERCEL === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: isVercel
        ? adapterVercel()
        : adapterNode({
            out: 'build',
            precompress: true,
            envPrefix: ''
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
