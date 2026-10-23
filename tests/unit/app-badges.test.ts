import { describe, expect, it } from 'vitest';
import { buildOrderBadges, lifecycleBadge, stageBadge, priorityBadge, notificationBadge } from '../../src/lib/badges/catalog';
import { normalizeOrderListRow, fetchOrderListRows } from '../../src/lib/order/order-list-data';
import { normalizeCalendarOrder } from '../../src/lib/calendar/day-summary';

const today = '2026-10-22';
const ids = (row: unknown) => buildOrderBadges(row, today).map(b => b.id);

describe('shared badge semantics', () => {
  it('derives lifecycle, urgency and both schedule signals from canonical fields', () => {
    expect(ids({ status: 'IN_PRODUCTION', priority: 'URGENT', due_date: '2026-10-21', loading_date: today }))
      .toEqual(['in_production', 'urgent', 'overdue', 'loading_today']);
    expect(ids({ status: 'confirmed', priority: 'HIGH', deadline: today, loadingDate: '2026-10-23' }))
      .toEqual(['confirmed', 'high', 'due_today', 'loading_scheduled']);
  });

  it('never calls completed or cancelled work overdue or scheduled for active loading', () => {
    for (const status of ['DISPATCHED', 'ARCHIVED', 'DONE', 'COMPLETED', 'CANCELLED', 'VOIDED', 'REJECTED']) {
      const badges = ids({ status, priority: 'URGENT', due: '2026-10-01', loadingDate: today,
        badges: ['URGENT', 'BLOCKED', 'IN_PROGRESS', 'READY_TO_SHIP', 'LOW_STOCK'] });
      expect(badges.length).toBe(1);
    }
    expect(ids({ badges: ['DONE', 'URGENT'], due: '2026-10-01', loadingDate: today })).toEqual(['completed']);
    expect(ids({ badges: ['OPEN', 'URGENT', 'DONE'], due: '2026-10-01', loadingDate: today })).toEqual(['completed']);
  });

  it('deduplicates flags, trusts known lifecycle over stale manual lifecycle badges, and preserves unknown state', () => {
    expect(ids({ status: 'IN_PRODUCTION', badges: ['OPEN', 'DRAFT', 'URGENT', 'URGENT', 'R&D'], priority: 'urgent', isRD: true }))
      .toEqual(['in_production', 'urgent', 'rd']);
    expect(lifecycleBadge('unexpected_state')?.id).toBe('unknown');
    expect(lifecycleBadge('unexpected_state')?.values?.state).toBe('UNEXPECTED STATE');
    expect(ids({ isDraft: true })).toEqual(['draft']);
  });

  it('treats date-only values as civil days, rejects impossible dates and keeps passed loading distinct from dispatched', () => {
    expect(ids({ status: 'CONFIRMED', deadline: '2026-10-22T00:00:00+03:00' })).toEqual(['confirmed', 'due_today']);
    expect(ids({ status: 'CONFIRMED', due: '2026-02-30', loadingDate: '2026-13-01' })).toEqual(['confirmed']);
    expect(ids({ status: 'READY_TO_LOAD', loadingDate: '2026-10-21' })).toEqual(['ready_to_load', 'loading_overdue']);
    expect(ids({ status: 'CONFIRMED', due: '2026-10-25' })).toEqual(['confirmed', 'due_soon']);
    expect(ids({ status: 'CONFIRMED', due: '2026-10-26' })).toEqual(['confirmed']);
  });

  it('uses consistent stage and notification signals, including new canonical notification types', () => {
    expect(stageBadge('BLOCKED').tone).toBe('danger');
    expect(stageBadge('REWORK').id).toBe('rework');
    expect(stageBadge('COMPLETED').id).toBe('completed');
    expect(priorityBadge(8).values).toEqual({ priority: 8 });
    expect(priorityBadge(8).tone).toBe('danger');
    expect(notificationBadge({ type: 'ORDER_CONFIRMED', category: 'ORDER' }).id).toBe('notification_order');
    expect(notificationBadge({ type: 'REWORK_REQUIRED', category: 'ORDER' }).id).toBe('rework');
    expect(notificationBadge({ type: 'LOW_STOCK', category: 'INVENTORY' }).id).toBe('low_stock');
    expect(notificationBadge({ type: 'CHAT_MESSAGE', category: 'CHAT' }).icon).toBe('message-square');
  });

  it('preserves the same manual flags, numeric priority and R&D signal on calendar and order views', () => {
    const api = { id: 'order-one', status: 'IN_PRODUCTION', priority: 8,
      badges: ['BLOCKED', 'URGENT'], isRd: true, deadline: today, loadingDate: today };
    expect(ids(normalizeCalendarOrder(api))).toEqual(ids(normalizeOrderListRow(api)));
    expect(ids(normalizeCalendarOrder(api))).toEqual(['in_production', 'urgent', 'blocked', 'due_today', 'loading_today', 'rd']);
    expect(normalizeCalendarOrder({ ...api, badges: [] })?.priority).toBe('8');
    expect(ids(normalizeCalendarOrder({ ...api, badges: [] }))).toContain('priority_number');
  });
});

describe('order list data fidelity', () => {
  it('preserves the UUID for routes, separate PO, uppercase draft status, priority and badge flags', () => {
    const row = normalizeOrderListRow({ id: 'uuid', poNumber: 'PO-42', status: 'DRAFT', priority: 'URGENT',
      deadline: today, badges: ['URGENT', 'URGENT', 'bogus'], isRD: true });
    expect(row.id).toBe('uuid');
    expect(row.poNumber).toBe('PO-42');
    expect(row.status).toBe('DRAFT');
    expect(row.isDraft).toBe(true);
    expect(row.priority).toBe('URGENT');
    expect(row.badges).toEqual(['URGENT']);
    expect(row.isRD).toBe(true);
  });

  it('reads every advertised page, removes overlapping records and does not discard lifecycle', async () => {
    const urls: string[] = [];
    const result = await fetchOrderListRows({ basePath: '/oms', fetcher: async url => {
      urls.push(String(url));
      return Response.json({ data: urls.length === 1 ? [{ id: 'a', status: 'DRAFT' }]
        : [{ id: 'a', status: 'DRAFT' }, { id: 'b', status: 'DISPATCHED' }],
        pagination: { hasMore: urls.length === 1, totalPages: 2 } });
    } });
    expect(urls).toEqual(['/oms/api/draft-orders?limit=100&page=1', '/oms/api/draft-orders?limit=100&page=2']);
    expect(result.map(row => row.id)).toEqual(['a', 'b']);
    expect(result[1].status).toBe('DISPATCHED');
  });

  it('rejects incomplete pages rather than presenting partial status counts', async () => {
    let calls = 0;
    await expect(fetchOrderListRows({ fetcher: async () => ++calls === 1
      ? Response.json({ data: [{ id: 'a' }], pagination: { hasMore: true } })
      : Response.json({ error: 'Unavailable' }, { status: 503 }) })).rejects.toThrow('503');
  });
});
