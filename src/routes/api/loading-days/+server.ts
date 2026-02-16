import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: days } = await locals.supabase.from('loading_days').select('*').order('date');
  return json(days || []);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const { data: day, error } = await locals.supabase.from('loading_days').insert(data).select().single();
    
    if (error) {
      console.error('Error inserting loading day:', error);
      return json({ error: error.message }, { status: 400 }); // Return 400 instead of 500 for DB errors usually
    }
    
    return json(day);
  } catch (err: any) {
    console.error('Unexpected error in POST /api/loading-days:', err);
    return json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
};
