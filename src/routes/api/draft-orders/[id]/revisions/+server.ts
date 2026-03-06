import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET - List revisions (audit history) for an order
export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params;

  try {
    const { data, error: dbError } = await locals.supabase
      .from('audit_log')
      .select('*')
      .eq('entity_type', 'draft_order')
      .eq('entity_id', id)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Error fetching revisions:', dbError);
      throw error(500, 'Failed to fetch revisions');
    }

    return json(data || []);
  } catch (err) {
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

// POST - Create a revision snapshot (manual checkpoint)
export const POST: RequestHandler = async ({ params, request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    const { id } = params;
    const body = await request.json();
    
    // Fetch current order state
    const { data: order, error: fetchError } = await locals.supabase
        .from('draft_orders')
        .select('*')
        .eq('id', id)
        .single();
        
    if (fetchError || !order) throw error(404, 'Order not found');

    // Create audit log entry as a "checkpoint"
    const { error: insertError } = await locals.supabase
        .from('audit_log')
        .insert({
            user_id: session.user.id,
            action: 'CHECKPOINT',
            entity_type: 'draft_order',
            entity_id: id,
            new_values: order,
            username: session.user.email // simplified
        });

    if (insertError) throw error(500, 'Failed to create revision checkpoint');

    return json({ success: true });
};
