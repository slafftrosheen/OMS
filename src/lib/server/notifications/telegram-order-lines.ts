/** Telegram order lines: readable status words and due-date flags.
 * Text only. Dates are compared as Riga calendar days supplied by the payload. */
import { orderLifecycle, type OrderLifecycle } from '$lib/order/status-semantics';

type Lang = 'en' | 'ru' | 'lv';
const statusWords: Record<Lang, Partial<Record<OrderLifecycle, string>>> = {
  en: { draft: 'Draft', pending_review: 'In review', confirmed: 'Confirmed', in_production: 'In production', ready_to_load: 'Ready to load', dispatched: 'Dispatched', archived: 'Archived', cancelled: 'Cancelled', voided: 'Voided', on_hold: 'On hold', completed: 'Completed', open: 'Open' },
  lv: { draft: 'Melnraksts', pending_review: 'Pārbaudē', confirmed: 'Apstiprināts', in_production: 'Ražošanā', ready_to_load: 'Gatavs iekraušanai', dispatched: 'Nosūtīts', archived: 'Arhivēts', cancelled: 'Atcelts', voided: 'Anulēts', on_hold: 'Apturēts', completed: 'Pabeigts', open: 'Atvērts' },
  ru: { draft: 'Черновик', pending_review: 'На проверке', confirmed: 'Подтверждён', in_production: 'В производстве', ready_to_load: 'Готов к погрузке', dispatched: 'Отправлен', archived: 'В архиве', cancelled: 'Отменён', voided: 'Аннулирован', on_hold: 'Приостановлен', completed: 'Завершён', open: 'Открыт' }
};
const dueWords: Record<Lang, { overdue: (days: number) => string; today: string; tomorrow: string }> = {
  en: { overdue: d => `Overdue ${d} d`, today: 'Due today', tomorrow: 'Due tomorrow' },
  lv: { overdue: d => `Nokavēts ${d} d.`, today: 'Termiņš šodien', tomorrow: 'Termiņš rīt' },
  ru: { overdue: d => `Просрочен на ${d} дн.`, today: 'Срок сегодня', tomorrow: 'Срок завтра' }
};
const DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const dayNumber = (value: unknown): number | null => {
  const match = typeof value === 'string' ? DAY.exec(value) : null;
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? Math.round(time / 86_400_000) : null;
};

export function telegramStatusWord(status: unknown, lang: Lang): string {
  const life = orderLifecycle(status);
  const word = life ? statusWords[lang][life] : undefined;
  return word ?? (typeof status === 'string' ? status.slice(0, 40) : '');
}

/** A flag only for open orders that are late, due today or due tomorrow. */
export function telegramDueFlag(dueDate: unknown, today: unknown, status: unknown, lang: Lang): string {
  const life = orderLifecycle(status);
  if (life && ['dispatched', 'archived', 'cancelled', 'voided', 'completed'].includes(life)) return '';
  const due = dayNumber(dueDate), now = dayNumber(today);
  if (due === null || now === null) return '';
  const diff = due - now, words = dueWords[lang];
  return diff < 0 ? `⚠ ${words.overdue(Math.min(-diff, 999))}` : diff === 0 ? `● ${words.today}` : diff === 1 ? words.tomorrow : '';
}

/** Round 6 · urgency for sorting and the digest line. Closed orders and missing dates rank last. */
export type TelegramDueBucket = 'overdue' | 'today' | 'tomorrow' | 'later' | 'none';
const CLOSED = ['dispatched', 'archived', 'cancelled', 'voided', 'completed'];
export function telegramDueBucket(dueDate: unknown, today: unknown, status: unknown): { bucket: TelegramDueBucket; diff: number | null } {
  const life = orderLifecycle(status);
  if (life && CLOSED.includes(life)) return { bucket: 'none', diff: null };
  const due = dayNumber(dueDate), now = dayNumber(today);
  if (due === null || now === null) return { bucket: 'none', diff: null };
  const diff = due - now;
  return { bucket: diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : 'later', diff };
}

const RANK: Record<TelegramDueBucket, number> = { overdue: 0, today: 1, tomorrow: 2, later: 3, none: 4 };
/** Most urgent first (most overdue at the top); ties keep the order the server sent. */
export function sortTelegramOrdersByUrgency<T extends { due_date?: unknown; status?: unknown }>(orders: readonly T[], today: unknown): T[] {
  return orders.map((order, index) => ({ order, index, ...telegramDueBucket(order.due_date, today, order.status) }))
    .sort((a, b) => RANK[a.bucket] - RANK[b.bucket] || (a.diff ?? 0) - (b.diff ?? 0) || a.index - b.index)
    .map(item => item.order);
}

const digestWords: Record<Lang, { overdue: string; today: string; tomorrow: string; loading: string }> = {
  en: { overdue: 'overdue', today: 'due today', tomorrow: 'due tomorrow', loading: 'loading today' },
  lv: { overdue: 'nokavēti', today: 'termiņš šodien', tomorrow: 'termiņš rīt', loading: 'iekraušana šodien' },
  ru: { overdue: 'просрочено', today: 'срок сегодня', tomorrow: 'срок завтра', loading: 'погрузка сегодня' }
};
/** "⚠ 2 overdue · ● 3 due today · 1 due tomorrow · 🚚 1 loading today" — empty when nothing is pressing. */
export function telegramDigestLine(orders: readonly { due_date?: unknown; loading_date?: unknown; status?: unknown }[], today: unknown, lang: Lang): string {
  const count = { overdue: 0, today: 0, tomorrow: 0, loading: 0 };
  const now = dayNumber(today);
  for (const order of orders) {
    const { bucket } = telegramDueBucket(order.due_date, today, order.status);
    if (bucket === 'overdue' || bucket === 'today' || bucket === 'tomorrow') count[bucket]++;
    const life = orderLifecycle(order.status);
    if (now !== null && dayNumber(order.loading_date) === now && !(life && CLOSED.includes(life))) count.loading++;
  }
  const w = digestWords[lang], parts: string[] = [];
  if (count.overdue) parts.push(`⚠ ${count.overdue} ${w.overdue}`);
  if (count.today) parts.push(`● ${count.today} ${w.today}`);
  if (count.tomorrow) parts.push(`${count.tomorrow} ${w.tomorrow}`);
  if (count.loading) parts.push(`🚚 ${count.loading} ${w.loading}`);
  return parts.join(' · ');
}
