import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function buildUserPayload(profile: any, authUser: any) {
  // Determine role: prefer new flat `role` column, fall back to deriving from legacy JSONB
  let role = profile?.role;
  if (!role) {
    const roles: Record<string, string> = profile?.roles ?? {};
    const vals = Object.values(roles);
    if (vals.includes('SuperAdmin')) role = 'RD';
    else if (vals.includes('StationLead')) role = 'StationHead';
    else role = 'Operator';
  }

  // Normalise stations: DB still has TEXT[] on profiles; new table is user_stations
  const rawStations: any[] = profile?.stations ?? [];
  const stations = rawStations.map((s: any) =>
    typeof s === 'string' ? { stationId: s, isHead: false } : s
  );

  return {
    id: profile?.id ?? authUser.id,
    email: authUser.email,
    username: profile?.username ?? '',
    displayName: profile?.display_name ?? profile?.username ?? authUser.email ?? '',
    avatarUrl: profile?.avatar_url ?? null,
    role,
    stations,
    // legacy fields — kept for backward compat
    primarySection: profile?.primary_section,
    sections: profile?.sections,
    roles: profile?.roles,
  };
}

/** POST /api/auth — email/password login */
export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  let { email, password } = body;
  const { username } = body;

  if (!password) return json({ error: 'Password required' }, { status: 400 });

  if (!email && username) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(username)) email = username;
    else return json({ error: 'Please provide a valid email address.' }, { status: 400 });
  }

  if (!email) return json({ error: 'Email required' }, { status: 400 });

  const { data, error } = await locals.supabase.auth.signInWithPassword({ email, password });
  if (error) return json({ error: error.message }, { status: 401 });

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  return json({ user: buildUserPayload(profile, data.user) });
};

/** DELETE /api/auth — logout */
export const DELETE: RequestHandler = async ({ locals }) => {
  const { error } = await locals.supabase.auth.signOut();
  if (error) return json({ error: error.message }, { status: 500 });
  return json({ success: true });
};

/** GET /api/auth — get current session */
export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ user: null });

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return json({ user: buildUserPayload(profile, session.user) });
};
