import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { GET } from '../../src/routes/api/telegram/workspace/+server';

describe('Telegram workspace endpoint', () => {
  const today = { date: '2026-11-21', timezone: 'Europe/Riga', orders: [], events: [] };

  function fixture(active: boolean, userId?: string, rpcError = false) {
    let calls = 0;
    const locals = {
      user: userId ? { id: userId } : null,
      supabase: {
        from(table: string) {
          assert.equal(table, 'profiles');
          return { select: () => ({ eq: (_column: string, id: string) => {
            assert.equal(id, userId);
            return { single: async () => ({ data: { is_active: active }, error: null }) };
          } }) };
        },
        async rpc(name: string, ...args: unknown[]) {
          calls++;
          assert.equal(name, 'telegram_workspace_today');
          assert.deepEqual(args, []);
          return { data: rpcError ? null : today, error: rpcError ? { message: 'private database details' } : null };
        },
      },
    };
    return { call: () => GET({ locals } as never), count: () => calls };
  }

  it('uses only the active signed-in OMS user and the scoped database RPC', async () => {
    for (const [test, code] of [[fixture(true), 401], [fixture(false, 'inactive'), 403]] as const) {
      assert.equal((await test.call()).status, code);
      assert.equal(test.count(), 0);
    }
    const workspace = fixture(true, 'staff');
    const reply = await workspace.call();
    assert.equal(workspace.count(), 1);
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await reply.json(), today);
  });

  it('reports deployment errors without exposing database internals', async () => {
    const reply = await fixture(true, 'staff', true).call();
    assert.equal(reply.status, 503);
    const body = await reply.json();
    assert.equal(body.code, 'workspace_unavailable');
    assert.ok(!JSON.stringify(body).includes('private database details'));
  });
});
