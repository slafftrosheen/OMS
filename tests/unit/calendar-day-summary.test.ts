import { describe, expect, it } from 'vitest';
import {
  buildCalendarDaySummary, dateKey, localDateKey, normalizeCalendarOrder,
  normalizeLoadingDay
} from '../../src/lib/calendar/day-summary';

const order = (id: string, extra: Record<string, unknown> = {}) => normalizeCalendarOrder({
  id, poNumber: `PO-${id}`, title: id, clientName: 'Client', status: 'IN_PRODUCTION', ...extra
})!;

describe('calendar day summaries', () => {
  it('keeps calendar dates local and rejects impossible dates', () => {
    expect(localDateKey(new Date(2026, 9, 22, 0, 15))).toBe('2026-10-22');
    expect(dateKey('2026-10-22T00:00:00+03:00')).toBe('2026-10-22');
    expect(dateKey('2024-02-29')).toBe('2024-02-29');
    expect(dateKey('2025-02-29')).toBe(null);
    expect(dateKey('2026-13-01')).toBe(null);
    expect(dateKey('2026-1-2')).toBe(null);
  });

  it('normalizes actual database loading rows, including blocked dates and notes', () => {
    expect(normalizeLoadingDay({ id: 'day-uuid', date: '2026-10-22', is_blocked: false,
      notes: 'Carrier: DPD - rear entrance', max_capacity: 4 })).toEqual({
      id: 'day-uuid', date: '2026-10-22', active: true,
      note: 'Carrier: DPD - rear entrance', carrier: '', capacity: 4
    });
    expect(normalizeLoadingDay({ id: 'x', date: '2026-10-22', is_blocked: true })?.active).toBe(false);
    expect(normalizeLoadingDay({ id: 'x', date: '2026-10-22', active: false })?.active).toBe(false);
  });

  it('normalizes both order API contracts without discarding lifecycle status', () => {
    const value = normalizeCalendarOrder({ id: 'one', po_number: '42', due_date: '2026-10-23',
      loading_date: '2026-10-22', client: 'Client', status: 'ready_to_load', priority: 'urgent' });
    expect(value?.status).toBe('READY_TO_LOAD');
    expect(value?.priority).toBe('URGENT');
    expect(value?.dueDate).toBe('2026-10-23');
    expect(value?.loadingDate).toBe('2026-10-22');
    expect(normalizeCalendarOrder({ title: 'missing id' })).toBe(null);
  });

  it('counts each order once and shows meetings and notes without inflating loading orders', () => {
    const scheduled = order('one', { loadingDate: '2026-10-22', deadline: '2026-10-22' });
    const summary = buildCalendarDaySummary('2026-10-22', {
      orders: [scheduled, scheduled], loadingDays: [], today: '2026-10-22',
      events: [
        { id: 'load', kind: 'loading', date: '2026-10-22', createdAt: '', poList: ['PO-one'] },
        { id: 'meeting', kind: 'meeting', date: '2026-10-22', createdAt: '', title: 'Briefing' },
        { id: 'note', kind: 'note', date: '2026-10-22', createdAt: '', title: 'Gate code' }
      ]
    });
    expect(summary.loadingOrders.length).toBe(1);
    expect(summary.badges.map(b => [b.kind, b.count])).toEqual([
      ['due', 1], ['loading', 1], ['meeting', 1], ['note', 1]
    ]);
  });

  it('marks overdue deadlines on their actual day and excludes terminal orders from alerts', () => {
    const orders = ['IN_PRODUCTION', 'DISPATCHED', 'ARCHIVED', 'CANCELLED', 'VOIDED', 'REJECTED', 'DONE', 'COMPLETED']
      .map((status, i) => order(String(i), { status, deadline: '2026-10-21' }));
    const past = buildCalendarDaySummary('2026-10-21', { orders, today: '2026-10-22' });
    expect(past.badges.map(b => [b.kind, b.count])).toEqual([['overdue', 1]]);
    expect(buildCalendarDaySummary('2026-10-22', { orders, today: '2026-10-22' }).badges.length).toBe(0);
  });

  it('excludes cancelled, voided and rejected orders even when legacy loading events still reference them', () => {
    const excluded = ['CANCELLED', 'VOIDED', 'rejected'].map((status, i) => order(`excluded-${i}`, {
      status, deadline: '2026-10-21', loadingDate: '2026-10-21'
    }));
    const summary = buildCalendarDaySummary('2026-10-21', {
      today: '2026-10-22', orders: [...excluded, order('active', { loadingDate: '2026-10-21' })],
      events: [{
        id: 'legacy', kind: 'loading', date: '2026-10-21', createdAt: '',
        poList: [...excluded.map(item => item.poNumber), excluded[0].id, 'PO-active', 'unknown-legacy-PO']
      }]
    });
    expect(summary.dueOrders.length).toBe(0);
    expect(summary.loadingOrders.map(item => item.id)).toEqual(['active']);
    expect(summary.badges).toEqual([{ kind: 'loading', count: 2 }]);
  });

  it('counts legacy event-only POs and deduplicates references to assigned orders', () => {
    const summary = buildCalendarDaySummary('2026-10-22', {
      today: '2026-10-22',
      orders: [order('assigned', { loadingDate: '2026-10-22' }), order('undated')],
      events: [
        { id: 'a', kind: 'loading', date: '2026-10-22', createdAt: '', poList: ['PO-assigned', 'PO-undated', 'legacy-PO'] },
        { id: 'b', kind: 'loading', date: '2026-10-22', createdAt: '', poList: ['PO-undated', 'legacy-PO'] }
      ]
    });
    expect(summary.badges).toEqual([{ kind: 'loading', count: 3 }]);
    expect(summary.loadingOrders.length).toBe(1);
  });

  it('shows a planned loading day even before orders are assigned and flags closed dates', () => {
    const day = normalizeLoadingDay({ id: 'day', date: '2026-10-22', is_blocked: false })!;
    const open = buildCalendarDaySummary(day.date, { loadingDays: [day], today: day.date });
    expect(open.badges.map(b => [b.kind, b.count])).toEqual([['loading', 0]]);
    const closed = buildCalendarDaySummary(day.date, { loadingDays: [{ ...day, active: false }], today: day.date });
    expect(closed.badges.map(b => b.kind)).toEqual(['closed']);
  });
});
