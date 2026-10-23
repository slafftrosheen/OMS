import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { aiRateLimit } from '$lib/server/api/helpers';
import { isUuid } from '$lib/server/toolkit/assets';
import { normalizeCanvasMediaUrl } from '$lib/components/canvas/toolkit-media-url';
import { fetchCanvasLinkPreview } from '$lib/server/toolkit/link-preview';

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireToolkitManager(locals.user);
  aiRateLimit(`${user.id}:link-preview`);
  const raw = await request.text();
  if (raw.length > 4096) throw error(413, 'Link request is too large');
  let body: any; try { body = JSON.parse(raw); } catch { throw error(400, 'Invalid link request'); }
  const url = normalizeCanvasMediaUrl(body?.url);
  if (!url || !isUuid(body?.boardId)) throw error(400, 'A project and public website link are required');
  const { data, error: lookupError } = await locals.supabase.from('canvas_documents')
    .select('id').eq('id', body.boardId).maybeSingle();
  if (lookupError) throw error(503, 'Project is unavailable');
  if (!data) throw error(404, 'Project not found');
  try {
    const metadata = await fetchCanvasLinkPreview(url);
    return json({ url, ...metadata, previewAvailable: !!metadata.title }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    // A website may block previews; the safe, usable link card still works.
    return json({ url, previewAvailable: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
};
