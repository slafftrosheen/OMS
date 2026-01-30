import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET: Get all stages for an order
export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  try {
    const { data, error: queryError } = await supabase
      .from('order_stages')
      .select('*')
      .eq('order_id', params.id)
      .order('station');

    if (queryError) throw error(500, queryError.message);

    return json(data || []);
  } catch (err: any) {
    if (err.status) throw err;
    throw error(500, 'Internal server error');
  }
};

// PATCH: Update a specific stage
export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  const station = url.searchParams.get('station');
  if (!station) throw error(400, 'Station parameter required');

  try {
    const body = await request.json();

    // Validate state transition (optional business logic)
    if (body.state) {
      const validStates = ['NOT_STARTED', 'QUEUED', 'IN_PROGRESS', 'BLOCKED', 'REWORK', 'COMPLETED'];
      if (!validStates.includes(body.state)) {
        throw error(400, 'Invalid state');
      }
    }

    const updateData: any = {
      updated_by: session.user.id
    };

    // Map allowed fields
    if (body.state) updateData.state = body.state;
    if (body.blocked_reason !== undefined) updateData.blocked_reason = body.blocked_reason;
    if (body.estimated_hours !== undefined) updateData.estimated_hours = body.estimated_hours;
    if (body.actual_hours !== undefined) updateData.actual_hours = body.actual_hours;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const { data, error: updateError } = await supabase
      .from('order_stages')
      .update(updateData)
      .eq('order_id', params.id)
      .eq('station', station)
      .select()
      .single();

    if (updateError) {
      console.error('Stage update error:', updateError);
      throw error(500, updateError.message);
    }

    return json(data);
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Stage PATCH error:', err);
    throw error(500, 'Internal server error');
  }
};
