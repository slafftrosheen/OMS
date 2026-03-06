import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST - Flag order for rework
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { id } = params;
  const body = await request.json();
  const { reason, station, notes } = body;

  if (!reason || !station) {
    throw error(400, 'Reason and station are required');
  }

  try {
    // 1. Update order status/stage
    // Assuming we update the specific station stage to 'REWORK'
    const { error: stageError } = await locals.supabase
        .from('order_stages')
        .upsert({
            draft_order_id: id,
            station,
            state: 'REWORK',
            notes: notes ? `Rework: ${reason}. ${notes}` : `Rework: ${reason}`,
            updated_at: new Date().toISOString()
        }, { onConflict: 'draft_order_id,station' });

    if (stageError) throw stageError;

    // 2. Log to station_logs
    const { error: logError } = await locals.supabase
        .from('station_logs')
        .insert({
            user_id: session.user.id,
            station,
            action: 'REWORK_FLAGGED',
            details: { order_id: id, reason, notes }
        });

    if (logError) console.error('Failed to log rework:', logError);

    // 3. Notify (optional/future)
    
    return json({ success: true, message: 'Order flagged for rework' });
  } catch (err: any) {
    console.error('Error flagging rework:', err);
    throw error(500, err.message || 'Failed to flag rework');
  }
};

// GET - Get rework history for order
export const GET: RequestHandler = async ({ params, locals }) => {
    const { id } = params;
    
    // Fetch logs related to rework for this order
    // This assumes we can filter station_logs by details->order_id
    // Note: Filtering JSONB efficiently requires specific operators/indexes
    
    const { data, error: dbError } = await locals.supabase
        .from('station_logs')
        .select('*')
        .eq('details->>order_id', id)
        .eq('action', 'REWORK_FLAGGED')
        .order('created_at', { ascending: false });

    if (dbError) {
        // Fallback if JSONB filtering fails or isn't supported in this setup
        return json([]);
    }

    return json(data);
};
