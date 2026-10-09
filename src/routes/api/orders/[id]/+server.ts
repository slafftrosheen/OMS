import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory } from '$lib/server/authz/shared-data';

// GET: Fetch single order with all relations
export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  try {
    // Get base order data
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', params.id)
      .single();

    if (orderError) {
      if (orderError.code === 'PGRST116') {
        throw error(404, 'Order not found');
      }
      throw error(500, orderError.message);
    }

    // Get stages
    const { data: stages } = await supabase
      .from('order_stages')
      .select('*')
      .eq('draft_order_id', params.id)
      .order('station');

    // Get materials
    const { data: materials } = await supabase
      .from('order_materials')
      .select('*')
      .eq('draft_order_id', params.id)
      .order('display_order');

    // Get custom fields
    const { data: fields } = await supabase
      .from('order_fields')
      .select('*')
      .eq('draft_order_id', params.id)
      .order('display_order');

    // Get assignees with user details
    const { data: assignees } = await supabase
      .from('order_assignees')
      .select(`
        *,
        user:user_id (
          id,
          email,
          profiles (full_name, avatar_url, station)
        )
      `)
      .eq('draft_order_id', params.id);

    // Get rework cycles
    const { data: reworkCycles } = await supabase
      .from('rework_cycles')
      .select(`
        *,
        creator:created_by (
          id,
          email,
          profiles (full_name)
        ),
        resolver:resolved_by (
          id,
          email,
          profiles (full_name)
        )
      `)
      .eq('draft_order_id', params.id)
      .order('created_at', { ascending: false });

    // Get revisions
    const { data: revisions } = await supabase
      .from('order_revisions')
      .select(`
        *,
        file:file_id (*),
        creator:created_by (
          id,
          email,
          profiles (full_name)
        )
      `)
      .eq('order_id', params.id)
      .order('revision_number', { ascending: false });

    // Get activity log (last 50 entries)
    const { data: activityLog } = await supabase
      .from('order_activity_log')
      .select('*')
      .eq('order_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50);

    return json({
      ...order,
      stages: stages || [],
      materials: materials || [],
      fields: fields || [],
      assignees: assignees || [],
      rework_cycles: reworkCycles || [],
      revisions: revisions || [],
      activity_log: activityLog || []
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Order GET error:', err);
    throw error(500, 'Internal server error');
  }
};

// PATCH: edit order metadata only — never the lifecycle, PO or loading assignment.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!canManageSharedInventory(locals.user.role)) throw error(403, 'Manager role required');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid request');
  if (['status', 'po_number', 'loading_date'].some(k => body[k] !== undefined)) {
    throw error(409, 'Use confirmation, loading assignment, dispatch or archive endpoints');
  }
  const allowed = ['title','client','due_date','is_rd','rd_notes','priority','notes','badges'] as const;
  const updateData: Record<string, unknown> = { updated_by: locals.user.id };
  for (const field of allowed) if (body[field] !== undefined) updateData[field] = body[field];
  if (Object.keys(updateData).length === 1) throw error(400, 'No editable fields supplied');
  const { data, error: updateErr } = await locals.supabase.from('draft_orders')
    .update(updateData).eq('id', params.id).select().maybeSingle();
  if (updateErr) throw error(500, 'Failed to update order');
  if (!data) throw error(404, 'Order not found');
  return json(data);
};

// DELETE: cancel a draft before confirmation. Production orders are never
// silently deleted; use managed void/reissue and explicit archive paths.
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!canManageSharedInventory(locals.user.role)) throw error(403, 'Manager role required');
  const { data: updated, error: updateErr } = await locals.supabase
    .from('draft_orders')
    .update({ status: 'CANCELLED', updated_by: locals.user.id })
    .eq('id', params.id).in('status', ['DRAFT', 'draft', 'PENDING_REVIEW'])
    .select('id,status').maybeSingle();
  if (updateErr) throw error(500, 'Failed to cancel order');
  if (!updated) throw error(409, 'Only draft or review orders can be cancelled');
  return json({ success: true, status: 'CANCELLED' });
};
