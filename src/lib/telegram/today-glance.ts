/** Round 6 · Mini App "today at a glance": three counts and a loading-first order list. Pure. */
export interface GlanceOrder { id: string; due_today?: boolean; loading_today?: boolean }
export interface TodayGlance { loading: number; due: number; unread: number }

export function todayGlance(orders: readonly GlanceOrder[], unread: number): TodayGlance {
  return {
    loading: orders.filter(order => order.loading_today === true).length,
    due: orders.filter(order => order.due_today === true).length,
    unread: Number.isInteger(unread) && unread > 0 ? unread : 0,
  };
}

/** Loading today first (the truck will not wait), then due today, then the rest; stable. */
export function sortTodayOrders<T extends GlanceOrder>(orders: readonly T[]): T[] {
  const rank = (order: GlanceOrder) => order.loading_today ? 0 : order.due_today ? 1 : 2;
  return orders.map((order, index) => ({ order, index })).sort((a, b) => rank(a.order) - rank(b.order) || a.index - b.index).map(item => item.order);
}
