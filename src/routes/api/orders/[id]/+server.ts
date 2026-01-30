import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
      .eq('order_id', params.id)
      .order('station');

    // Get materials
    const { data: materials } = await supabase
      .from('order_materials')
      .select('*')
      .eq('order_id', params.id)
      .order('display_order');

    // Get custom fields
    const { data: fields } = await supabase
      .from('order_fields')
      .select('*')
      .eq('order_id', params.id)
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
      .eq('order_id', params.id);

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
      .eq('order_id', params.id)
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

// PATCH: Update order
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  try {
    const body = await request.json();

    // Prepare update data
    const updateData: any = {
      updated_by: session.user.id
    };

    // Only include provided fields
    const allowedFields = [
      'po_number', 'title', 'client', 'due_date', 'loading_date',
      'is_rd', 'rd_notes', 'status', 'priority', 'notes', 'badges'
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    // Update order
    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error('Order update error:', updateError);
      throw error(500, updateError.message);
    }

    return json(order);
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Order PATCH error:', err);
    throw error(500, 'Internal server error');
  }
};

// DELETE: Delete order (soft delete by setting status to cancelled)
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  try {
    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      throw error(403, 'Only admins can delete orders');
    }

    // Soft delete: set status to cancelled
    const { error: deleteError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        updated_by: session.user.id
      })
      .eq('id', params.id);

    if (deleteError) {
      console.error('Order delete error:', deleteError);
      throw error(500, deleteError.message);
    }

    return json({ success: true, message: 'Order cancelled successfully' });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Order DELETE error:', err);
    throw error(500, 'Internal server error');
  }
};
