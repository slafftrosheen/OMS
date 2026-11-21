import { describe, expect, it } from 'vitest';
import { readOrderRoutes } from '../../src/lib/server/order/order-routes';

describe('readOrderRoutes', () => {
  it('queries only selected orders in bounded batches and groups their visible stages', async () => {
    const orderIds = Array.from({ length: 41 }, (_, index) => `order-${index}`);
    const requests: string[][] = [];
    const client = {
      from(table: string) {
        expect(table).toBe('order_stages');
        return {
          select(columns: string) {
            expect(columns).toBe('draft_order_id, station, state');
            return {
              async in(field: string, ids: string[]) {
                expect(field).toBe('draft_order_id');
                requests.push(ids);
                return {
                  data: ids.includes('order-0') ? [
                    { draft_order_id: 'order-0', station: 'CAD', state: 'COMPLETED' },
                    { draft_order_id: 'order-0', station: 'CNC', state: 'IN_PROGRESS' }
                  ] : [],
                  error: null
                };
              }
            };
          }
        };
      }
    } as unknown as Parameters<typeof readOrderRoutes>[0];

    const routes = await readOrderRoutes(client, orderIds);
    expect(requests.map(request => request.length)).toEqual([40, 1]);
    expect(requests.flat()).toEqual(orderIds);
    expect(routes?.get('order-0')).toEqual([
      { station: 'CAD', state: 'COMPLETED' },
      { station: 'CNC', state: 'IN_PROGRESS' }
    ]);
    expect(routes?.get('order-1')).toBe(undefined);
  });

  it('returns an empty route map without issuing a query for an empty result page', async () => {
    const client = {} as Parameters<typeof readOrderRoutes>[0];
    expect((await readOrderRoutes(client, []))?.size).toBe(0);
  });
});
