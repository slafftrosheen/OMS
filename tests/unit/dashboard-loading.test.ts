import { describe, it, expect } from 'vitest';
import { loadDashboard } from '../../src/lib/dashboard/data';

describe('independent dashboard panels', () => {
  it('starts all three requests together and preserves base paths and cancellation', async () => {
    const calls: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
    const resolve: Array<(response: Response) => void> = [];
    const controller = new AbortController();
    const pending = loadDashboard({ basePath: '/oms', signal: controller.signal, fetcher: async (url, init) => {
      calls.push({ url: String(url), signal: init?.signal });
      return new Promise<Response>(done => resolve.push(done));
    } });
    expect(calls.length).toBe(3);
    expect(calls.every(call => call.url.startsWith('/oms/api/') && call.signal === controller.signal)).toBe(true);
    resolve[0](Response.json({ count: 26, data: [{ id: 'uuid', poNumber: 'PO-10', clientName: 'Client', status: 'IN_PRODUCTION', priority: 2, badges: ['RD'], loadingDate: '2026-10-22' }] }));
    resolve[1](Response.json({ data: { orders: { total: 26, active: 12, today: 3, completedToday: 1 } } }));
    resolve[2](Response.json({ data: { dates: ['2026-10-22'], total: [3] } }));
    const result = await pending;
    expect(result.verifiedTotal).toBe(26);
    expect(result.orders[0].id).toBe('uuid');
    expect(result.orders[0].po_number).toBe('PO-10');
    expect(result.orders[0].badges).toEqual(['RD']);
    expect(result.orders[0].priority).toBe(2);
    expect(result.kpis?.active).toBe(12);
    expect(result.trends?.total).toEqual([3]);
  });

  it('retains available metrics when the recent-orders panel fails', async () => {
    const result = await loadDashboard({ fetcher: async url => String(url).includes('/orders?')
      ? new Response(null, { status: 500 })
      : String(url).includes('kpis') ? Response.json({ data: { orders: { total: 0, active: 0, today: 0, completedToday: 0 } } })
      : Response.json({ data: { dates: [], total: [] } }) });
    expect(result.ordersError).toBe(true);
    expect(result.orders).toEqual([]);
    expect(result.kpis?.total).toBe(0);
    expect(result.trends).toEqual({ dates: [], total: [] });
  });

  it('keeps unavailable or malformed metrics distinct from verified zero values', async () => {
    const result = await loadDashboard({ fetcher: async url => String(url).includes('/orders?')
      ? Response.json({ data: [], count: 0 })
      : String(url).includes('kpis') ? Response.json({ data: { orders: { total: '0', active: 0, today: 0, completedToday: 0 } } })
      : Response.json({ data: { dates: ['2026-10-22'], total: [] } }) });
    expect(result.ordersError).toBe(false);
    expect(result.verifiedTotal).toBe(0);
    expect(result.kpis).toBe(null);
    expect(result.trends).toBe(null);
  });
});
