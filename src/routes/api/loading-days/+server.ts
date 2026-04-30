import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const activeOnly = url.searchParams.get('active') === 'true';
  
  let query = locals.supabase
    .from('loading_days')
    .select('*')
    .order('date', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_blocked', false);
  }

  const { data: days, error: fetchError } = await query;
  
  if (fetchError) {
    console.error('Error fetching loading days:', fetchError);
    throw error(500, 'Failed to fetch loading days');
  }

  return json(days || []);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  try {
    const body = await request.json();
    
    // Map frontend fields to database schema
    const data = {
      date: body.date,
      notes: body.notes || body.note || '',
      is_blocked: body.is_blocked ?? false,
      max_capacity: body.max_capacity ?? 10
    };

    // If carrier is provided, prepend it to notes
    if (body.carrier) {
      data.notes = `Carrier: ${body.carrier}${data.notes ? ' - ' + data.notes : ''}`;
    }

    const { data: day, error: insertError } = await locals.supabase
      .from('loading_days')
      .insert(data)
      .select()
      .single();
    
    if (insertError) {
      console.error('Error inserting loading day:', insertError);
      return json({ error: insertError.message }, { status: 400 });
    }
    
    return json(day);
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Unexpected error in POST /api/loading-days:', err);
    throw error(500, err.message || 'Internal Server Error');
  }
};
