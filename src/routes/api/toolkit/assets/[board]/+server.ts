import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'node:crypto';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { isUuid, validatedToolkitFile, signatureMatches, MAX_TOOLKIT_ASSET_BYTES, TOOLKIT_ASSET_BUCKET, toolkitUploadReadiness } from '$lib/server/toolkit/assets';

const noStore = { 'Cache-Control': 'private, no-store' };
/** Called before uploading so the browser can report a startup limit mismatch
 * instead of attempting an upload that the adapter will abruptly disconnect. */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireToolkitManager(locals.user);
  if (!isUuid(params.board)) throw error(400, 'Invalid project ID');
  const { data, error: lookup } = await locals.supabase.from('canvas_documents')
    .select('id').eq('id', params.board).maybeSingle();
  if (lookup) throw error(503, 'Canvas database unavailable');
  if (!data) throw error(404, 'Project not found');
  // Prevent allocating/uploading binaries if the R06 metadata migration is
  // missing. RLS permits managers to read their shared asset metadata.
  const { error: metadataError } = await locals.supabase.from('toolkit_assets')
    .select('id').limit(1);
  if (metadataError) return json({ ready: false,
    error: 'Toolkit file database is unavailable. Verify the R06 Storage migration and grants.' },
    { status: 503, headers: noStore });
  const { error: storageCheckError } = await locals.supabase.storage
    .from(TOOLKIT_ASSET_BUCKET).list('', { limit: 1 });
  if (storageCheckError) return json({ ready: false,
    error: 'The private Toolkit Storage bucket is unavailable. Check bucket creation and authenticated SELECT policy.' },
    { status: 503, headers: noStore });
  const capacity = toolkitUploadReadiness(process.env.BODY_SIZE_LIMIT);
  return json({ ...capacity, formats: ['PNG','JPEG','WebP','GIF','PDF'],
    maximumFileBytes: MAX_TOOLKIT_ASSET_BYTES,
    ...(!capacity.ready ? { error: 'The OMS server upload limit is below 26 MB. Set BODY_SIZE_LIMIT=32M in the systemd service environment, restart OMS, and check the proxy client_max_body_size.' } : {})
  }, { status: capacity.ready ? 200 : 503, headers: noStore });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireToolkitManager(locals.user);
  if (!isUuid(params.board)) throw error(400, 'Invalid project ID');
  const capacity = toolkitUploadReadiness(process.env.BODY_SIZE_LIMIT);
  if (!capacity.ready) throw error(503, 'Upload not configured: set BODY_SIZE_LIMIT=32M and restart OMS');
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize && declaredSize > MAX_TOOLKIT_ASSET_BYTES + 1024 * 1024) {
    throw error(413, 'File exceeds upload limit');
  }
  const { data: board, error: lookupError } = await locals.supabase
    .from('canvas_documents').select('id').eq('id', params.board).maybeSingle();
  if (lookupError) throw error(503, 'Project unavailable');
  if (!board) throw error(404, 'Project not found');
  let form: FormData;
  try { form = await request.formData(); }
  catch { throw error(413, 'Could not read upload. Check file size and reverse-proxy body limit.'); }
  const entry = form.get('file');
  if (!(entry instanceof File)) throw error(400, 'Choose an image or PDF');
  const file = entry;
  const { mime, name } = validatedToolkitFile(file); 
  // Reject before loading into memory. SvelteKit already enforces a global
  // request limit, and this route enforces the tighter 25 MiB per-file cap.
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
