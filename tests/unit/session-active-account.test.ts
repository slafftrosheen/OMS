import { describe, expect, it } from 'vitest';
import { getSessionUser } from '../../src/lib/server/auth/session';

const id = '12345678-0000-0000-0000-000000000001';

function sessionEvent(profile: Record<string, unknown>, signedIn = true) {
  const queried: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { queried.push([column, value]); return query; },
    single: async () => ({ data: { id, username: 'operator', display_name: 'OMS user', ...profile }, error: null })
  };
  const event: any = { locals: {
    getSession: async () => signedIn ? { user: { id, email: 'fixture@example.test' } } : null,
    supabase: { from: (table: string) => { queried.push(['table', table]); return query; } }
  } };
  return { event, queried };
}

describe('OMS server session active-account boundary', () => {
  it('rejects disabled profiles and fails closed when the active flag is absent or null', async () => {
    for (const is_active of [false, undefined, null]) {
      const { event } = sessionEvent({ is_active, role: 'RD' });
      expect(await getSessionUser(event)).toBe(null);
    }
  });

  it('preserves the active profile role and station assignments bound to the verified session', async () => {
    const { event, queried } = sessionEvent({ is_active: true, role: 'HeadOfProduction',
      user_stations: [{ station_id: 'cutting', is_head: true }] });
    const user = await getSessionUser(event);
    expect(user).toEqual({ id, email: 'fixture@example.test', username: 'operator', displayName: 'OMS user',
      role: 'HeadOfProduction', stations: [{ stationId: 'cutting', isHead: true }] });
    expect(queried).toEqual([['table', 'profiles'], ['id', id]]);
  });

  it('keeps the existing least-privilege default when an active profile has no role or stations', async () => {
    const { event } = sessionEvent({ is_active: true, role: null });
    const user = await getSessionUser(event);
    expect(user?.role).toBe('Operator');
    expect(user?.stations).toEqual([]);
  });

  it('does not query profiles when the verified session is missing', async () => {
    const { event, queried } = sessionEvent({ is_active: true, role: 'RD' }, false);
    expect(await getSessionUser(event)).toBe(null);
    expect(queried).toEqual([]);
  });
});
