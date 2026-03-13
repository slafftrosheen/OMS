import * as ssr from '../../node_modules/svelte/src/runtime/ssr.js';

export * from '../../node_modules/svelte/src/runtime/ssr.js';

export const untrack = ssr.untrack ?? ((fn) => fn());

export default ssr;
