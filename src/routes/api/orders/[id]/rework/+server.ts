import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET: Get rework cycles for an order
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  const station = url.searchParams.get('station');

  try {
    let query = supabase
      .from('rework_cycles')
      .select(`
        *,
        creator:created_by (
          id,
          email,
          profiles (full_name, avatar_url)
        ),
        resolver:resolved_by (
          id,
          email,
          profiles (full_name, avatar_url)
        )
      `)
      .eq('order_id', params.id);

    if (station) {
      query = query.eq('station', station);
    }

    const { data, error: queryError } = await query
      .order('created_at', { ascending: false });

    if (queryError) throw error(500, queryError.message);

    return json(data || []);
  } catch (err: any) {
    if (err.status) throw err;
    throw error(500, 'Internal server error');
  }
};

// POST: Create rework cycle
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  try {
    const body = await request.json();

    if (!body.station || !body.reason) {
      throw error(400, 'Station and reason are required');
    }

    // Validate station and reason enums
    const validStations = ['CAD', 'CNC', 'SANDING', 'BENDING', 'WELDING', 'PAINT', 'ASSEMBLY', 'QC', 'LOGISTICS'];
    const validReasons = ['RECUT', 'RESAND', 'REBEND', 'REWELD', 'REPAINT', 'REASSEMBLE', 'RECHECK', 'CUSTOM'];

    if (!validStations.includes(body.station)) {
      throw error(400, 'Invalid station');
    }
    if (!validReasons.includes(body.reason)) {
      throw error(400, 'Invalid reason');
    }

    const { data, error: insertError } = await supabase
      .from('rework_cycles')
      .insert({
        order_id: params.id,
        station: body.station,
        reason: body.reason,
        description: body.description,
        defect_category: body.defect_category,
        root_cause: body.root_cause,
        corrective_action: body.corrective_action,
        created_by: session.user.id
      })
      .select(`
        *,
        creator:created_by (
          id,
          email,
          profiles (full_name, avatar_url)
        )
      `)
      .single();

    if (insertError) {
      console.error('Rework creation error:', insertError);
      throw error(500, insertError.message);
    }

    return json(data, { status: 201 });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Rework POST error:', err);
    throw error(500, 'Internal server error');
  }
};

// PATCH: Resolve rework cycle
export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  const reworkId = url.searchParams.get('rework_id');
  if (!reworkId) throw error(400, 'rework_id parameter required');

  try {
    const body = await request.json();

    const { data, error: updateError } = await supabase
      .from('rework_cycles')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: session.user.id,
        resolution_notes: body.resolution_notes
      })
      .eq('id', reworkId)
      .eq('order_id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error('Rework resolution error:', updateError);
      throw error(500, updateError.message);
    }

    return json(data);
  } catch (err: any) {
    if (err.status) throw err;
    throw error(500, 'Internal server error');
  }
};
