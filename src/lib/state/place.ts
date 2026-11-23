// Reclame Fabriek "By place" theming.
// Floor screens (stations, production board, wall displays) render in Night Shift;
// everything else renders on Paper. Only applies when the user's theme is "ByPlace".
export type Place = 'office' | 'floor';

const FLOOR_PREFIXES = ['/station', '/production', '/kanban', '/logistics/dashboard'];
const OFFICE_EXCEPTIONS = ['/production/planner', '/production/performance'];

export function placeForPath(pathname: string): Place {
  if (OFFICE_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'office';
  return FLOOR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/')) ? 'floor' : 'office';
}

export function resolvePlace(pathname: string, search: string): Place {
  const pinned = new URLSearchParams(search).get('place');
  return pinned === 'floor' || pinned === 'office' ? pinned : placeForPath(pathname);
}

/** Inside the Telegram Mini App the chat's light/dark scheme decides the place,
 * unless the URL pins one. Only affects the "By place" theme, like every place. */
export function telegramPlace(pathname: string, search: string, scheme: string | undefined): Place {
  const pinned = new URLSearchParams(search).get('place');
  if (pinned === 'floor' || pinned === 'office') return pinned;
  return scheme === 'dark' ? 'floor' : scheme === 'light' ? 'office' : placeForPath(pathname);
}

export function applyPlace(pathname: string, search: string) {
  if (typeof document !== 'undefined') {
    const scheme = document.documentElement.dataset.tgScheme;
    document.documentElement.dataset.place = scheme ? telegramPlace(pathname, search, scheme) : resolvePlace(pathname, search);
  }
}

export function isDarkAppearance(theme: string | undefined, place: string | undefined): boolean {
  return !theme || theme === 'DarkVim' || theme.startsWith('HighContrast') ||
    (theme === 'ByPlace' && place === 'floor');
}

export function appearanceThemeColor(theme: string | undefined, place: Place): string {
  if (theme?.startsWith('HighContrast')) return '#000000';
  return isDarkAppearance(theme, place) ? '#121316' : '#F3F2EF';
}
