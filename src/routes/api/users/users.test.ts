import { describe, it, expect } from 'vitest';
import { POST } from './+server';
import { DELETE } from './[id]/+server';
import { supabaseAdmin } from '$lib/server/supabase-admin';

const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'RD' };
const target = '22222222-2222-4222-8222-222222222222';
const body = { username: 'worker', displayName: 'Worker', email: 'worker@example.test', password: 'TestPass123!' };
const event = (user: unknown, data: unknown = body, id = target) => ({
  locals: { user }, params: { id },
  request: new Request('http://localhost/api/users', { method: 'POST', body: JSON.stringify(data) })
}) as any;

describe('user account lifecycle', () => {
  it('blocks deleting your own account before accessing the database', async () => {
    await expect(DELETE(event(actor, {}, actor.id))).rejects.toMatchObject({ status: 400 });
  });

  it('rejects non-admin deletion and malformed account IDs', async () => {
    await expect(DELETE(event({ ...actor, role: 'Operator' }))).rejects.toMatchObject({ status: 403 });
    await expect(DELETE(event(actor, {}, 'bad-id'))).rejects.toMatchObject({ status: 400 });
  });

  it('rejects malformed creation data before calling Auth', async () => {
    expect((await POST(event(actor, { ...body, username: '  ' }))).status).toBe(400);
    expect((await POST(event(actor, { ...body, role: 'SuperAdmin' }))).status).toBe(400);
    expect((await POST(event(actor, { ...body, stations: [{ stationId: 'unknown', isHead: false }] }))).status).toBe(400);
    expect((await POST(event(actor, { ...body, password: 12345678 }))).status).toBe(400);
  });

  it('returns a conflict for an existing inactive username before creating another login', async () => {
    const originalFrom = supabaseAdmin.from;
    (supabaseAdmin as any).from = () => ({ select: () => ({ ilike: () => ({
      maybeSingle: async () => ({ data: { id: target, is_active: false }, error: null })
    }) }) });
    try {
      const response = await POST(event(actor));
      expect(response.status).toBe(409);
      expect((await response.json()).error).toMatch(/already exists/i);
    } finally { supabaseAdmin.from = originalFrom; }
  });

  it('removes a newly created login if profile, station or preference setup fails', async () => {
    const originalFrom = supabaseAdmin.from;
    const originalCreate = supabaseAdmin.auth.admin.createUser;
    const originalDelete = supabaseAdmin.auth.admin.deleteUser;
    const originalError = console.error;
    try {
      console.error = () => {};
      for (const failedTable of ['profiles', 'user_stations', 'user_preferences']) {
        const logins = new Set<string>();
        (supabaseAdmin.auth.admin as any).createUser = async () => {
          logins.add(target);
          return { data: { user: { id: target } }, error: null };
        };
        (supabaseAdmin.auth.admin as any).deleteUser = async (id: string) => {
          logins.delete(id);
          return { data: { user: null }, error: null };
        };
        (supabaseAdmin as any).from = (table: string) => {
          const result = { data: null, error: table === failedTable ? { message: 'Setup failed' } : null };
          return {
            select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            upsert: () => table === 'profiles' ? {
              select: () => ({ single: async () => ({ ...result, data: { id: target, username: 'worker' } }) })
            } : Promise.resolve(result),
            insert: async () => result
          };
        };
        const response = await POST(event(actor, { ...body, stations: [{ stationId: 'cnc', isHead: false }] }));
        expect(response.status).toBe(500);
        expect(logins.size).toBe(0);
      }
    } finally {
      supabaseAdmin.from = originalFrom;
      supabaseAdmin.auth.admin.createUser = originalCreate;
      supabaseAdmin.auth.admin.deleteUser = originalDelete;
      console.error = originalError;
    }
  });
});
