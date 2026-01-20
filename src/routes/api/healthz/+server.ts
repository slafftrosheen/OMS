import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    const { error } = await locals.supabase
      .from('profiles')
      .select('id')
      .limit(1);

    return json({
      status: error ? 'degraded' : 'ok',
      db: error ? 'error' : 'ok',
      time: new Date().toISOString()
    });
  } catch (err) {
    return json({
      status: 'error',
      message: (err as Error).message,
      time: new Date().toISOString()
    }, { status: 500 });
  }
};
