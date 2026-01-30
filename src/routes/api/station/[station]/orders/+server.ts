import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// import { createClient } from '@supabase/supabase-js';
// import { SUPABASE_URL, SUPABASE_ANON_KEY } from '$env/static/private';

// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;
  const station = params.station.toUpperCase();

  // Validate station
  const validStations = ['CAD', 'CNC', 'SANDING', 'BENDING', 'WELDING', 'PAINT', 'ASSEMBLY', 'QC', 'LOGISTICS'];
  if (!validStations.includes(station)) {
    throw error(400, 'Invalid station');
  }

  try {
    // Get orders for this station
    const { data: stages, error: stagesError } = await supabase
      .from('order_stages')
      .select(`
        *,
        order:orders (
          id,
          po_number,
          title,
          client,
          due_date,
          priority,
          status,
          badges
        )
      `)
      .eq('station', station)
      .in('order.status', ['active', 'draft'])
      .neq('state', 'COMPLETED')
      .order('order.priority', { ascending: false })
      .order('order.due_date', { ascending: true });

    if (stagesError) throw error(500, stagesError.message);

    // Transform the data
    const orders = stages?.map(stage => ({
      id: stage.order.id,
      po_number: stage.order.po_number,
      title: stage.order.title,
      client: stage.order.client,
      due_date: stage.order.due_date,
      priority: stage.order.priority,
      status: stage.order.status,
      badges: stage.order.badges,
      stage: {
        id: stage.id,
        state: stage.state,
        started_at: stage.started_at,
        blocked_reason: stage.blocked_reason,
        estimated_hours: stage.estimated_hours,
        actual_hours: stage.actual_hours,
        notes: stage.notes
      }
    })) || [];

    return json(orders);
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Station orders fetch error:', err);
    throw error(500, 'Internal server error');
  }
};
