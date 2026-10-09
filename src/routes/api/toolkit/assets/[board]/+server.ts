import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'node:crypto';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { isUuid, validatedToolkitFile, signatureMatches, MAX_TOOLKIT_ASSET_BYTES, TOOLKIT_ASSET_BUCKET } from '$lib/server/toolkit/assets';

const noStore = { 'Cache-Control': 'private, no-store' };
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireToolkitManager(locals.user);
  if (!isUuid(params.board)) throw error(400, 'Invalid project ID');
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize && declaredSize > MAX_TOOLKIT_ASSET_BYTES + 1024 * 1024) {
    throw error(413, 'File exceeds upload limit');
  }
  const { data: board, error: lookupError } = await locals.supabase
    .from('canvas_documents').select('id').eq('id', params.board).maybeSingle();
  if (lookupError) throw error(503, 'Project unavailable');
  if (!board) throw error(404, 'Project not found');
  const form = await request.formData().catch(() => null);
  const entry = form?.get('file');
  if (!(entry instanceof File)) throw error(400, 'Choose an image or PDF');
  const file = entry;
  const { mime, name } = validatedToolkitFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!signatureMatches(mime, buffer.subarray(0, 16))) throw error(415, 'File contents do not match the declared format');
  const id = randomUUID();
  const path = `${params.board}/${id}`;
  const { error: uploadError } = await locals.supabase.storage
    .from(TOOLKIT_ASSET_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error('[Toolkit] Asset upload failure', uploadError.message);
    throw error(503, 'Project file upload unavailable');
  }
  const { error: dbError } = await locals.supabase.from('toolkit_assets').insert({
    id, canvas_id: params.board, user_id: user.id,
    file_name: name, mime_type: mime, bytes: buffer.length, storage_path: path
  });
  if (dbError) {
    await locals.supabase.storage.from(TOOLKIT_ASSET_BUCKET).remove([path]).catch(() => undefined);
    console.error('[Toolkit] Asset metadata failure', dbError.code);
    throw error(503, 'Could not register project file');
  }
  return json({
    id, url: `/api/toolkit/assets/${params.board}/${id}`,
    fileName: name, mime, bytes: buffer.length
  }, { status: 201, headers: noStore });
};
