/** Recovery list of private files uploaded to a shared Canvas.
 * A successful Storage write can outlive a failed/aborted tldraw snapshot
 * save; listing the files allows a manager to attach them again.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { isUuid } from '$lib/server/toolkit/assets';

const headers = { 'Cache-Control': 'private, no-store' };

export const GET: RequestHandler = async ({ locals, params }) => {
  requireToolkitManager(locals.user);
  if (!isUuid(params.board)) throw error(400, 'Invalid project ID');
  const { data: canvas, error: canvasError } = await locals.supabase
    .from('canvas_documents').select('id').eq('id', params.board).maybeSingle();
  if (canvasError) throw error(503, 'Project database unavailable');
  if (!canvas) throw error(404, 'Project not found');
  const { data, error: filesError } = await locals.supabase.from('toolkit_assets')
    .select('id,file_name,mime_type,bytes,created_at')
    .eq('canvas_id', params.board)
    .order('created_at', { ascending: false })
    .limit(100);
  if (filesError) throw error(503, 'Project asset library unavailable');
  return json({ files: (data ?? []).filter(row => isUuid(row.id)).map(row => ({
    id: row.id, fileName: row.file_name, mime: row.mime_type,
    bytes: row.bytes, createdAt: row.created_at,
    url: `/api/toolkit/assets/${params.board}/${row.id}`
  })) }, { headers });
};
