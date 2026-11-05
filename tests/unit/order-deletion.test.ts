import { describe, it, expect } from 'vitest';
import { DELETE as deleteOrder } from '../../src/routes/api/orders/[id]/+server';
import { DELETE as deleteDraft } from '../../src/routes/api/draft-orders/[id]/+server';

function event(role: string | null, result: any = { data: { success: true, status: 'CANCELLED' }, error: null }) {
  const calls: any[] = [];
  return { calls, params: { id: '11111111-1111-4111-8111-111111111111' },
    request: new Request('http://localhost/api/orders/test', { method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: '2026-11-05T10:00:00.000Z' }) }),
    locals: { user: role ? { id: 'actor', role } : null,
      supabase: { rpc: async (...args: any[]) => { calls.push(args); return result; } } } };
}
async function status(handler: any, e: any) {
  try { return (await handler(e)).status; } catch (error: any) { return error.status; }
}
describe('audited manager order deletion', () => {
  it('supports Boss, HeadOfProduction and RD through both existing DELETE URLs', async () => {
    for (const role of ['Boss', 'HeadOfProduction', 'RD']) for (const handler of [deleteOrder, deleteDraft]) {
      const e = event(role);
      expect(await status(handler, e)).toBe(200);
      expect(e.calls[0][0]).toBe('oms_delete_order');
      expect(e.calls[0][1].p_expected_updated_at).toBe('2026-11-05T10:00:00.000Z');
    }
  });
  it('rejects anonymous and station users before any database mutation', async () => {
    for (const role of [null, 'Operator', 'StationHead']) {
      const e = event(role);
      expect(await status(deleteOrder, e)).toBe(role ? 403 : 401);
      expect(e.calls).toHaveLength(0);
    }
  });
  it('rejects deletion without the revision currently shown to the manager', async () => {
    const e = event('Boss');
    e.request = new Request('http://localhost/api/orders/test', { method: 'DELETE' });
    expect(await status(deleteOrder, e)).toBe(428);
    expect(e.calls).toHaveLength(0);
  });
  it('reports missing migration, stale revision and database role denial', async () => {
    for (const [code, expected] of [['PGRST202',503], ['40001',409], ['42501',403]]) {
      expect(await status(deleteOrder, event('Boss', { data: null, error: { code } }))).toBe(expected);
    }
  });
});
