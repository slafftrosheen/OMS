/**
 * @template T
 * @typedef {Object} Diff
 * @property {string} key
 * @property {string=} label
 * @property {T=} before
 * @property {T=} after
 * @property {boolean} changed
 */

/**
 * @template T
 * @param {Record<string, T | undefined>} before
 * @param {Record<string, T | undefined>} after
 * @returns {Diff<T>[]} arrays describing the differences per key
 */
export function diffKeyValues(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return Array.from(keys).map((key) => ({
    key,
    before: before?.[key],
    after: after?.[key],
    changed: before?.[key] !== after?.[key]
  }));
}
