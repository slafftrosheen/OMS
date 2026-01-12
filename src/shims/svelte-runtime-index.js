import * as runtime from '../../node_modules/svelte/src/runtime/index.js';

export * from '../../node_modules/svelte/src/runtime/index.js';

export const untrack = runtime.untrack ?? ((fn) => fn());

export default runtime;
