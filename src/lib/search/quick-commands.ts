/**
 * Round 6 · quick commands for the Ctrl/⌘ + K search.
 *
 * Pure: builds the "Go to" and "Do" list for a user, ranks it against a typed
 * query (accent- and case-insensitive, so "razo" finds "Ražošana"), recognises
 * order numbers for a direct jump, and keeps a small per-user list of recently
 * opened orders. Server routes still enforce access; this list only hides what
 * the navigation already hides.
 */
import type { IconName } from '$lib/ui/icons';

export type QuickGroup = 'recent' | 'go' | 'do';
export interface QuickCommand {
  id: string; group: QuickGroup; labelKey: string; fallback: string; href: string; icon: IconName;
  /** Extra words that should find this command, in every language. */
  keywords: string[];
  /** Set for recent orders: the literal title to show instead of a translation. */
  title?: string;
}
interface QuickUser { role?: string | null }
const ADMIN = new Set(['RD', 'Boss', 'HeadOfProduction']);

const go = (id: string, href: string, icon: IconName, fallback: string, keywords: string[]): QuickCommand =>
  ({ id, group: 'go', labelKey: `quick.go.${id}`, fallback, href, icon, keywords });
const act = (id: string, href: string, icon: IconName, fallback: string, keywords: string[]): QuickCommand =>
  ({ id, group: 'do', labelKey: `quick.do.${id}`, fallback, href, icon, keywords });

export function quickCommands(user: QuickUser | null, canCreateOrder: boolean): QuickCommand[] {
  if (!user) return [];
  const list: QuickCommand[] = [];
  if (canCreateOrder) list.push(act('newOrder', '/orders/new', 'plus', 'New order', ['create', 'jauns', 'pasūtījums', 'новый', 'заказ', 'draft']));
  list.push(
    act('urgent', '/orders?status=urgent', 'alert-triangle', 'Urgent orders', ['late', 'overdue', 'steidzami', 'nokavēti', 'срочные', 'просрочен']),
    act('canvas', '/toolkit/canvas', 'pen-tool', 'Open canvas', ['draw', 'dxf', 'cad', 'nest', 'zīmēt', 'audekls', 'холст', 'чертёж']),
    go('home', '/', 'home', 'Home', ['dashboard', 'sākums', 'главная']),
    go('orders', '/orders', 'clipboard-list', 'Orders', ['pasūtījumi', 'заказы', 'po']),
    go('calendar', '/calendar', 'calendar', 'Calendar', ['loading', 'kalendārs', 'iekraušana', 'календарь', 'погрузка']),
    go('inventory', '/inventory', 'package', 'Inventory', ['stock', 'materials', 'noliktava', 'склад', 'материалы']),
    go('toolkit', '/toolkit', 'wrench', 'Toolkit', ['tools', 'rīki', 'инструменты']),
    go('cabinet', '/cabinet', 'user', 'My cabinet', ['profile', 'kabinets', 'кабинет']),
    go('settings', '/settings', 'settings', 'Settings', ['preferences', 'iestatījumi', 'настройки', 'theme', 'language']),
  );
  if (ADMIN.has(String(user.role))) list.push(
    go('users', '/admin/users', 'users', 'Users', ['admin', 'lietotāji', 'пользователи', 'roles']),
    go('materials', '/admin/materials', 'layers', 'Materials', ['admin', 'materiāli', 'материалы', 'catalog']),
  );
  return list;
}

const STRIP = /[\u0300-\u036f]/g;
export const fold = (text: string) => text.normalize('NFKD').replace(STRIP, '').toLowerCase().trim();

/** 0 = no match. Prefix beats word start beats substring beats in-order letters. */
export function scoreText(query: string, text: string): number {
  const q = fold(query), t = fold(text);
  if (!q) return 1;
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s/·\-_.]+/).some(word => word.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  let at = 0;
  for (const ch of q) { at = t.indexOf(ch, at); if (at < 0) return 0; at++; }
  return q.length >= 3 ? 10 : 0;
}

export function rankCommands(query: string, commands: readonly QuickCommand[], label: (c: QuickCommand) => string, limit = 6): QuickCommand[] {
  if (!fold(query)) return commands.slice(0, limit);
  return commands
    .map((command, index) => {
      const best = Math.max(scoreText(query, command.title ?? label(command)), ...command.keywords.map(k => scoreText(query, k) - 5));
      return { command, index, score: best };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(item => item.command);
}

/** "po-2611", "PO 2611", "#2611" → a search link for that order number. */
export function orderJump(query: string): { number: string; href: string } | null {
  const match = /^\s*(?:#|po[\s-]?)?(\d{3,8})\s*$/i.exec(query) ?? /^\s*(po[\s-]?\d{2,8}(?:[-/][a-z0-9]{1,6})?)\s*$/i.exec(query);
  if (!match) return null;
  const raw = match[1].toUpperCase().replace(/^PO[\s-]?/, 'PO-');
  const number = /^\d/.test(raw) ? `PO-${raw}` : raw;
  return { number, href: `/orders?q=${encodeURIComponent(number)}` };
}

const RECENT_KEY = 'oms.recentOrders.v1';
const MAX_RECENT = 6;
export interface RecentOrder { id: string; title: string; at: number }
const ORDER_ID = /^[A-Za-z0-9-]{1,64}$/;

export function readRecentOrders(storage: Pick<Storage, 'getItem'> | null | undefined, userId: string | null | undefined): RecentOrder[] {
  if (!userId) return [];
  try {
    const data = JSON.parse(storage?.getItem(`${RECENT_KEY}:${userId}`) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is RecentOrder => !!item && typeof item.id === 'string' && ORDER_ID.test(item.id) &&
      typeof item.title === 'string' && typeof item.at === 'number').slice(0, MAX_RECENT)
      .map(item => ({ id: item.id, title: item.title.slice(0, 120), at: item.at }));
  } catch { return []; }
}

export function rememberRecentOrder(storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined, userId: string | null | undefined,
  order: { id: string; title: string }, now = Date.now()): RecentOrder[] {
  if (!userId || !ORDER_ID.test(order.id)) return readRecentOrders(storage, userId);
  const title = order.title.trim().slice(0, 120) || order.id;
  const next = [{ id: order.id, title, at: now }, ...readRecentOrders(storage, userId).filter(item => item.id !== order.id)].slice(0, MAX_RECENT);
  try { storage?.setItem(`${RECENT_KEY}:${userId}`, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function recentCommands(recent: readonly RecentOrder[]): QuickCommand[] {
  return recent.map(order => ({
    id: `recent:${order.id}`, group: 'recent', labelKey: 'quick.recent', fallback: order.title, title: order.title,
    href: `/orders/${encodeURIComponent(order.id)}`, icon: 'clock', keywords: [],
  }));
}
