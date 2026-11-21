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

export function applyPlace(pathname: string, search: string) {
  if (typeof document === 'undefined') return;
  // ?place=floor|office lets a wall display or tablet pin its place.
  const pinned = new URLSearchParams(search).get('place');
  document.documentElement.dataset.place =
    pinned === 'floor' || pinned === 'office' ? pinned : placeForPath(pathname);
}
