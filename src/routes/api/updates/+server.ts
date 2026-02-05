import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    const session = await locals.getSession();

    if (!session) {
      return json({ updates: [], timestamp: new Date().toISOString() });
    }

    return json({ updates: [], timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Updates API error:', error);
    return json({ updates: [], timestamp: new Date().toISOString() });
  }
};
