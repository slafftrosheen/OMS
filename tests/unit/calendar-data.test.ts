import { describe, expect, it } from 'vitest';
import { fetchCalendarOrders, fetchCalendarJson } from '../../src/lib/calendar/calendar-data';

describe('calendar data loading', () => {
  it('loads all order pages under the app base path and deduplicates overlapping pages', async () => {
    const urls: string[] = [];
    const orders = await fetchCalendarOrders({ basePath: '/oms', fetcher: async url => {
      urls.push(String(url));
      const page = new URL(String(url), 'https://example.test').searchParams.get('page');
      return Response.json({ data: page === '1' ? [{ id: 'one' }] : [{ id: 'one' }, { id: 'two' }],
        pagination: { hasMore: page === '1', totalPages: 2 } });
    } });
    expect(urls).toEqual(['/oms/api/draft-orders?limit=100&page=1', '/oms/api/draft-orders?limit=100&page=2']);
    expect(orders.map(o => o.id)).toEqual(['one', 'two']);
  });

  it('rejects a failed later page rather than publishing incomplete badge counts', async () => {
    let call = 0;
    await expect(fetchCalendarOrders({ fetcher: async () => ++call === 1
      ? Response.json({ data: [{ id: 'one' }], pagination: { hasMore: true } })
      : Response.json({ error: 'offline' }, { status: 503 }) })).rejects.toThrow('503');
  });

  it('rejects malformed payloads instead of rendering a false empty day', async () => {
    await expect(fetchCalendarOrders({ fetcher: async () => Response.json({ error: 'invalid' }) }))
      .rejects.toThrow('Invalid');
  });

  it('aborts slow requests and honors caller cancellation', async () => {
    const stalled: typeof fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
    await expect(fetchCalendarJson('/api/calendar', { fetcher: stalled, timeoutMs: 5 })).rejects.toThrow('timed out');
    const controller = new AbortController();
    const pending = fetchCalendarJson('/api/calendar', { fetcher: stalled, signal: controller.signal });
    controller.abort(new Error('Changed month'));
    await expect(pending).rejects.toThrow('Changed month');
  });
});
