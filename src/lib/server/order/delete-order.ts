import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { canManageSharedInventory } from '$lib/server/authz/shared-data';

/** A soft deletion retains files, consumption and audit history. */
export const deleteOrder: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!canManageSharedInventory(locals.user.role)) throw error(403, 'Manager role required');
  const body = await request.json().catch(() => null);
  const revision = z.string().max(64).datetime({ offset: true }).safeParse(body?.expectedUpdatedAt);
  if (!revision.success) throw error(428, 'Reload this order before deleting: revision required');
  const { data, error: failed } = await locals.supabase.rpc('oms_delete_order', {
    p_order_id: params.id, p_expected_updated_at: revision.data
  });
  if (failed) {
    if (['PGRST202', '42883'].includes(failed.code)) throw error(503, 'Order deletion migration is not deployed');
    if (failed.code === '42501') throw error(403, 'Manager role required');
    if (failed.code === 'P0002') throw error(404, 'Order not found');
    if (['40001','22023'].includes(failed.code)) throw error(409, 'Order changed or is closed. Reload before deleting.');
    throw error(503, 'Order deletion unavailable');
  }
  if (!data?.success) throw error(503, 'Order deletion returned no result');
  return json(data, { headers: { 'Cache-Control': 'private, no-store' } });
};
