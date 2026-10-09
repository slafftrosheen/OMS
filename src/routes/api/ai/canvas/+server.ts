// Team library: every RD, Boss and HeadOfProduction user sees the same projects.
// Enforced both here and by PostgreSQL RLS; all new boards are shared by default.
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireToolkitManager, validateCanvasPayload, validateCanvasTitle } from '$lib/server/toolkit/access';
import { TOOLKIT_ASSET_BUCKET } from '$lib/server/toolkit/assets';

const headers = { 'Cache-Control': 'private, no-store' };
export const GET: RequestHandler = async ({ locals }) => {
  requireToolkitManager(locals.user);
  const { data, error: dbError } = await locals.supabase.from('canvas_documents')
    .select('id,title,thumbnail_url,shared,revision,created_at,updated_at')
    .order('updated_at', { ascending: false }).limit(200);
  if (dbError) { console.error('[Toolkit] list failed', dbError.code); throw error(503, 'Project library unavailable'); }
  return json({ items: data ?? [] }, { headers });
};
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireToolkitManager(locals.user);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid project');
  const title = validateCanvasTitle(body.title ?? 'Untitled project');
  const payload = validateCanvasPayload(body.payload ?? { version: 1, snapshot: null });
  const { data, error: dbError } = await locals.supabase.from('canvas_documents')
    .insert({ title, payload, user_id: user.id, shared: true })
    .select('id,title,thumbnail_url,shared,revision,created_at,updated_at').single();
  if (dbError || !data) { console.error('[Toolkit] create failed', dbError?.code); throw error(503, 'Could not create project'); }
  return json({ canvas: data }, { status: 201, headers });
};
export const DELETE: RequestHandler = async ({ url, locals }) => {
  requireToolkitManager(locals.user);
  const id = url.searchParams.get('id');
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw error(400, 'Valid project ID required');
  const { data: files } = await locals.supabase.from('toolkit_assets')
    .select('storage_path').eq('canvas_id', id);
  const { data, error: dbError } = await locals.supabase.from('canvas_documents')
    .delete().eq('id', id).select('id').maybeSingle();
  if (dbError) { console.error('[Toolkit] delete failed', dbError.code); throw error(503, 'Could not delete project'); }
  if (!data) throw error(404, 'Project not found');
  // Metadata cascades with the project; delete storage objects best-effort.
  // Failure doesn't resurrect deleted records, but is logged for housekeeping.
  const paths = (files ?? []).map(row => row.storage_path).filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) {
    const { error: storageError } = await locals.supabase.storage.from(TOOLKIT_ASSET_BUCKET)
      .remove(paths.slice(i, i + 100));
    if (storageError) console.error('[Toolkit] Asset cleanup pending', storageError.message);
  }
  return json({ ok: true }, { headers });
};
