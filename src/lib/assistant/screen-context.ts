export type AssistantScreen = 'dashboard' | 'orders' | 'draft' | 'inventory' | 'materials' | 'calendar' | 'production' | 'station' | 'canvas' | 'toolkit' | 'settings' | 'notifications' | 'general';

export function screenFromPath(path: string): AssistantScreen {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (clean === '/') return 'dashboard';
  if (clean === '/orders/new' || /^\/orders\/[^/]+\/edit$/.test(clean)) return 'draft';
  if (/^\/orders(?:\/|$)/.test(clean)) return 'orders';
  if (/^\/admin\/materials(?:\/|$)/.test(clean) || clean === '/inventory/catalog') return 'materials';
  if (/^\/inventory(?:\/|$)/.test(clean)) return 'inventory';
  if (/^\/calendar(?:\/|$)/.test(clean)) return 'calendar';
  if (/^\/production(?:\/|$)/.test(clean)) return 'production';
  if (/^\/station\/[^/]+$/.test(clean)) return 'station';
  if (clean === '/toolkit/canvas') return 'canvas';
  if (/^\/toolkit(?:\/|$)/.test(clean)) return 'toolkit';
  if (/^\/(?:settings|admin)(?:\/|$)/.test(clean)) return 'settings';
  if (/^\/notifications(?:\/|$)/.test(clean)) return 'notifications';
  return 'general';
}

/** Context is a bounded user-visible snapshot. Never forward credentials or files. */
export function safeScreenData(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 1200);
  if (Array.isArray(value)) return value.slice(0, 30).map(entry => safeScreenData(entry, depth + 1));
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/(?:password|secret|token|credential|api.?key|cookie|authorization|signed.?url|storage.?path|file.?bytes|base64|__proto__|constructor|prototype)/i.test(key)
  ).slice(0, 40).map(([key, entry]) => [key.slice(0, 80), safeScreenData(entry, depth + 1)]));
}

/** Match tools to the current task; permission checks remain server-owned. */
export function isToolRelevant(slug: string, screen: AssistantScreen, station?: string): boolean {
  if (slug === 'catalog.search') return ['dashboard','orders','draft','inventory','materials','production','station','canvas','toolkit'].includes(screen);
  if (slug === 'data.pending_orders') return ['dashboard','orders','calendar','production'].includes(screen);
  if (slug === 'data.low_stock') return ['dashboard','inventory','materials','production'].includes(screen);
  if (slug.startsWith('signage.')) return ['draft','canvas','toolkit'].includes(screen) || (screen === 'station' && station === 'ASSEMBLY');
  if (slug === 'cnc.feeds_speeds') return screen === 'station' && station === 'CNC';
  if (slug === 'paint.match') return screen === 'station' && ['PAINT', 'PAINTING'].includes(station || '');
  // Web research is deliberately opened through the canvas research workflow.
  return false;
}
