/**
 * Station attachments API — delete a single attachment
 * DELETE /api/station-attachments/[id]
 *
 * NOTE: the `station_attachments` table is referenced by the parent
 * src/routes/api/station-attachments/+server.ts but no CREATE TABLE for it was
 * found in supabase/migrations. This route mirrors that pattern so the request
 * no longer 404s; if the table is missing the DB call will surface a clear
 * error. A follow-up migration should create `station_attachments`.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// DELETE /api/station-attachments/[id]
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const supabase = locals.supabase;
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };

  try {
    const { error: dbError } = await supabase
      .from('station_attachments')
      .delete()
      .eq('id', id);

    if (dbError) {
      console.error('[Station Attachments] Delete error:', dbError);
      throw error(500, 'Failed to delete attachment');
    }

    return json({ success: true });
  } catch (err) {
    console.error('[Station Attachments] Error:', err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, 'Failed to delete attachment');
  }
};
