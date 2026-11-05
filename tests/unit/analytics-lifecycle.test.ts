import { describe, it, expect } from 'vitest';
import { summarizeOrders, dailyOrderTrends, logisticsMetrics } from '../../src/lib/server/analytics/order-metrics';
const now = new Date('2026-11-05T12:00:00Z');
const rows = [
 { id:'a', status:'DRAFT', created_at:'2026-11-05T08:00:00Z', due_date:'2026-11-07' },
 { id:'b', status:'IN_PRODUCTION', created_at:'2026-11-03T08:00:00Z', due_date:'2026-11-04' },
 { id:'c', status:'DISPATCHED', created_at:'2026-11-01T08:00:00Z', dispatched_at:'2026-11-05T08:00:00Z', loading_date:'2026-11-05' },
 { id:'d', status:'ARCHIVED', created_at:'2026-11-01T08:00:00Z', dispatched_at:'2026-11-04T08:00:00Z', archived_at:'2026-11-05T08:00:00Z' },
 { id:'e', status:'CANCELLED', created_at:'2026-11-05T08:00:00Z', due_date:'2026-11-01' },
 { id:'f', status:'READY_TO_LOAD', created_at:'2026-11-03T08:00:00Z', loading_date:'2026-11-05', due_date:'2026-11-06' }
];
describe('canonical dashboard lifecycle metrics', () => {
 it('counts dispatched/archived once and excludes deleted orders from active work', () => {
  expect(summarizeOrders(rows, now)).toMatchObject({ total:5, active:3, today:1, completedToday:1, completed:2 });
 });
 it('uses dispatch dates for completion charts even after an order is archived', () => {
  const result = dailyOrderTrends(rows, 7, now);
  expect(result.dates).toHaveLength(7);
  expect(result.completed.slice(-2)).toEqual([1,1]);
  expect(result.total[result.total.length-1]).toBe(1);
 });
 it('computes logistics from real orders and capacity rows, including zero capacity', () => {
  expect(logisticsMetrics(rows, [{date:'2026-11-05', max_capacity:10, used_count:3}], now))
    .toMatchObject({ pending_dispatch:1, scheduled_today:1, overdue:1, loading_capacity_pct:30 });
  expect(logisticsMetrics(rows, [], now).loading_capacity_pct).toBeNull();
 });
});
