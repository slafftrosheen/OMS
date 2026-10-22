import { describe, it, expect } from 'vitest';
import { load } from '../../src/routes/orders/[id]/edit/+page';

// Universal loads run on navigation and SSR without RequestEvent.locals.
// A saved order must remain editable in both cases.
describe('saved order editor loading', () => {
  it('loads a saved order without server-only locals', async () => {
    const order = { id: 'order-1', title: 'Saved sign', files: [] };
    const presets = [{ id: 'preset-1', name: 'Sign panel' }];
    const result = await load({
      params: { id: 'order-1' },
      fetch: async (url: string) => Response.json(
        url === '/api/draft-orders/order-1' ? order : presets
      )
    } as any);
    expect(result).toEqual({ id: 'order-1', order, files: [], profilePresets: presets, session: null });
  });

  it('returns its unavailable-order state if the request fails without locals', async () => {
    const result = await load({
      params: { id: 'order-2' },
      fetch: async () => { throw new Error('Test network failure'); }
    } as any);
    expect(result).toEqual({ id: 'order-2', order: null, files: [], profilePresets: [], session: null });
  });
});
