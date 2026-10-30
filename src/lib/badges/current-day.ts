import { readable } from 'svelte/store';
import { localDateKey } from '$lib/calendar/day-summary';

/** One shared timer keeps schedule badges accurate across midnight and after sleep. */
export const currentDay = readable(localDateKey(new Date()), set => {
  if (typeof window === 'undefined') return;
  const refresh = () => set(localDateKey(new Date()));
  refresh();
  const timer = setInterval(refresh, 60_000);
  window.addEventListener('focus', refresh);
  return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
});
