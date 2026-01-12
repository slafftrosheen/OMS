import { writable, derived, get } from 'svelte/store';

const loaders = new Map();
const pending = new Map();
const dictionaries = writable({});
let fallbackLocale = 'en';

export function addMessages(code, messages) {
  if (typeof code !== 'string') throw new TypeError('locale code must be a string');
  if (messages == null || typeof messages !== 'object') throw new TypeError('messages must be an object');
  dictionaries.update((dicts) => ({
    ...dicts,
    [code]: { ...(dicts[code] || {}), ...messages }
  }));
}

export function register(code, loader) {
  if (typeof code !== 'string') throw new TypeError('locale code must be a string');
  if (typeof loader !== 'function') throw new TypeError('loader must be a function');
  loaders.set(code, loader);
}

async function loadLocale(code) {
  if (!code || pending.has(code) || get(dictionaries)[code]) return;
  const loader = loaders.get(code);
  if (!loader) {
    dictionaries.update((dicts) => ({ ...dicts, [code]: {} }));
    return;
  }
  const task = Promise.resolve(loader()).then((module) => {
    const messages = module?.default ?? module;
    dictionaries.update((dicts) => ({ ...dicts, [code]: messages || {} }));
  }).finally(() => {
    pending.delete(code);
  });
  pending.set(code, task);
  await task;
}

export async function init(options = {}) {
  fallbackLocale = options.fallbackLocale || fallbackLocale;
  const start = options.initialLocale || fallbackLocale;
  await loadLocale(fallbackLocale);
  if (start !== fallbackLocale) {
    await loadLocale(start);
  }
  locale.set(start);
}

export function getLocaleFromNavigator() {
  if (typeof navigator === 'undefined') return undefined;
  const lang = navigator.languages?.[0] || navigator.language;
  if (!lang) return undefined;
  return lang.toLowerCase().split('-')[0];
}

export const locale = writable(fallbackLocale);

locale.subscribe((code) => {
  if (!code) return;
  loadLocale(code);
});

function resolvePath(target, path) {
  if (!target) return undefined;
  return path.split('.').reduce((acc, segment) => (acc == null ? acc : acc[segment]), target);
}

function format(message, vars) {
  if (typeof message !== 'string') return message;
  return message.replace(/\{(\w+)\}/g, (_, key) => (key in (vars || {}) ? String(vars[key]) : ''));
}

export const t = derived([locale, dictionaries], ([$locale, $dicts]) => {
  return (path, vars = {}) => {
    const primary = resolvePath($dicts[$locale], path);
    const fallback = $locale === fallbackLocale ? undefined : resolvePath($dicts[fallbackLocale], path);
    const message = primary ?? fallback ?? path;
    return format(message, vars);
  };
});
