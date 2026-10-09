// R02 — atomic, capacity-aware loading assignment. Requires SQL migration 00002.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory } from '$lib/server/authz/shared-data';

async function updateLoading(
  locals: App.Locals,
  dayId: string,
  orderId: string,
  action: 'assign' | 'unassign'
) {
  const actor = locals.user;
  if (!actor) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageSharedInventory(actor.role)) {
    return json({ error: 'Loading-day management requires RD, Boss or HeadOfProduction' }, { status: 403 });
  }
  if (!orderId.trim()) return json({ error: 'orderId required' }, { status: 400 });
  const { data, error: rpcErr } = await locals.supabase.rpc('assign_order_loading_day', {
    p_day_id: dayId, p_order_id: orderId, p_action: action
  });
  if (rpcErr) {
    console.error('[Loading assignment] Transaction rejected', rpcErr);
    const migrationMissing = rpcErr.code === 'PGRST202' || /Could not find the function/.test(rpcErr.message ?? '');
    return json({
      error: migrationMissing
        ? 'Loading assignment database migration is not installed'
        : 'Loading assignment rejected: check order readiness, date capacity, QC and permissions'
    }, { status: migrationMissing ? 503 : 409 });
  }
  return json(data);
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.orderId !== 'string') return json({ error: 'orderId required' }, { status: 400 });
  return updateLoading(locals, params.id, body.orderId, 'assign');
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
  const orderId = url.searchParams.get('orderId');
  if (!orderId) return json({ error: 'orderId required' }, { status: 400 });
  return updateLoading(locals, params.id, orderId, 'unassign');
};
