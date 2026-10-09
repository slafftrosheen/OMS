// Shared canvas document, with CAS revisions to prevent silent overwrites.
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireToolkitManager, validateCanvasPayload, validateCanvasTitle, validateCanvasRevision } from '$lib/server/toolkit/access';

const headers = { 'Cache-Control': 'private, no-store' };
export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireToolkitManager(locals.user);
  const fields = url.searchParams.get('meta') === '1'
    ? 'id,title,revision,updated_at'
    : 'id,title,payload,revision,shared,user_id,updated_at,created_at';
  const { data, error: dbError } = await locals.supabase.from('canvas_documents')
    .select(fields)
    .eq('id', params.id).maybeSingle();
  if (dbError) { console.error('[Toolkit] open failed', dbError.code); throw error(503, 'Could not open project'); }
  if (!data) throw error(404, 'Project not found');
  return json({ canvas: data }, { headers });
};
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireToolkitManager(locals.user);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid save request');
  const revision = validateCanvasRevision(body.revision);
  const patch: Record<string, unknown> = {};
  if ('title' in body) patch.title = validateCanvasTitle(body.title);
  if ('payload' in body) patch.payload = validateCanvasPayload(body.payload);
  if (!Object.keys(patch).length) throw error(400, 'No project changes provided');
  // The database trigger increments revision and updated_at atomically.
  // The revision WHERE clause is evaluated under the same UPDATE row lock.
  const { data, error: dbError } = await locals.supabase.from('canvas_documents')
    .update(patch).eq('id', params.id).eq('revision', revision)
    .select('id,title,revision,updated_at').maybeSingle();
  if (dbError) { console.error('[Toolkit] save failed', dbError.code); throw error(503, 'Could not save project'); }
  if (!data) {
    // A different user/tab may have saved a newer revision. Do not retry
    // with the same local snapshot, or their edits would be overwritten.
    return json({ error: 'Project changed elsewhere. Reload to review the latest version.', code: 'REVISION_CONFLICT' },
      { status: 409, headers });
  }
  return json({ canvas: data }, { headers });
};
