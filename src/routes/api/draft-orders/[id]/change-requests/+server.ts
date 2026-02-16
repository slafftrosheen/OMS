import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params;
  const { data, error: dbError } = await locals.supabase
    .from('change_requests')
    .select(`
      *,
      proposed_by_user:proposed_by(email),
      reviewed_by_user:reviewed_by(email)
    `)
    .eq('order_id', id)
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('Error fetching change requests:', dbError);
    return json({ error: 'Failed to fetch change requests' }, { status: 500 });
  }

  return json(data);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const { id } = params;
  const body = await request.json();
  const { title, description, changes, station, priority } = body;

  if (!title || !changes) {
    throw error(400, 'Title and changes are required');
  }

  // Use the RPC function if available, otherwise direct insert
  try {
    const { data, error: rpcError } = await locals.supabase.rpc('create_change_request', {
      p_order_id: id,
      p_title: title,
      p_description: description,
      p_changes: changes,
      p_station: station || 'General',
      p_priority: priority || 'normal'
    });

    if (rpcError) {
        // Fallback to direct insert if RPC missing
        console.warn('RPC create_change_request failed, falling back to direct insert', rpcError);
        const { data: insertData, error: insertError } = await locals.supabase
            .from('change_requests')
            .insert({
                order_id: id,
                title,
                description,
                changes,
                proposed_by: session.user.id,
                station: station || 'General',
                priority: priority || 'normal',
                status: 'pending'
            })
            .select()
            .single();
            
        if (insertError) throw insertError;
        return json(insertData, { status: 201 });
    }

    return json({ id: data }, { status: 201 });
  } catch (err) {
    console.error('Error creating change request:', err);
    throw error(500, 'Failed to create change request');
  }
};
