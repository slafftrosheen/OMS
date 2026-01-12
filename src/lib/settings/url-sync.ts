import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { locale } from 'svelte-i18n';
import { theme, type ThemeName } from '$lib/stores/theme';
import { scale, type Scale } from '$lib/stores/scale';
import { get, type Unsubscriber } from 'svelte/store';

type PrefKey = 'theme' | 'lang' | 'scale';

type PrefValueMap = {
  theme: ThemeName;
  lang: string;
  scale: Scale;
};

type UpdateResult = {
  changed: boolean;
  present: boolean;
};

function updateQueryParam<K extends PrefKey>(key: K, value: PrefValueMap[K] | null): UpdateResult | undefined {
  if (!browser) return;

  const url = new URL(window.location.href);
  const params = url.searchParams;
  const previous = params.get(key);

  if (value) {
    if (previous === value) {
      return { changed: false, present: true };
    }

    params.set(key, value);
    const query = params.toString();
    const next = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
    replaceState(next, {});
    return { changed: true, present: true };
  }

  if (previous === null) {
    return { changed: false, present: false };
  }

  params.delete(key);
  const query = params.toString();
  const next = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  replaceState(next, {});
  return { changed: true, present: false };
}

export function startPreferenceUrlSync() {
  if (!browser) return;

  const unsubscribers: Unsubscriber[] = [];

  const params = new URLSearchParams(window.location.search);

  const initialTheme = get(theme);
  const hadThemeParamInitially = params.has('theme');

  const initialLang = get(locale) ?? 'en';
  const hadLangParamInitially = params.has('lang');

  const initialScale = get(scale);
  const hadScaleParamInitially = params.has('scale');

  unsubscribers.push(
    theme.subscribe((value) => {
      if (!hadThemeParamInitially && value === initialTheme) {
        updateQueryParam('theme', null);
        return;
      }

      updateQueryParam('theme', value);
    })
  );

  unsubscribers.push(
    locale.subscribe((value) => {
      if (!value) return;
      if (!hadLangParamInitially && value === initialLang) {
        updateQueryParam('lang', null);
        return;
      }

      updateQueryParam('lang', value);
    })
  );

  unsubscribers.push(
    scale.subscribe((value) => {
      if (!hadScaleParamInitially && value === initialScale) {
        updateQueryParam('scale', null);
        return;
      }

      updateQueryParam('scale', value);
    })
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
