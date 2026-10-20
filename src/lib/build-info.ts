/**
 * OMS source revision and compilation time, baked into the Vite bundle.
 * This deliberately does NOT read the checkout or filesystem at request time:
 * the running process can otherwise advertise a newer git pull while still
 * serving an old compiled client.
 */
export const buildInfo = Object.freeze({
  revision: __OMS_BUILD_REVISION__,
  builtAt: __OMS_BUILD_TIME__,
  design: 'LUMIGRID graphite/magenta'
});
