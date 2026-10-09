import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { isUuid, TOOLKIT_ASSET_BUCKET } from '$lib/server/toolkit/assets';

export const GET: RequestHandler = async ({ params, locals }) => {
  requireToolkitManager(locals.user);
  if (!isUuid(params.board) || !isUuid(params.asset)) throw error(400, 'Invalid file reference');
  const { data: row, error: metaError } = await locals.supabase.from('toolkit_assets')
    .select('storage_path,mime_type,file_name,bytes')
    .eq('id', params.asset).eq('canvas_id', params.board).maybeSingle();
  if (metaError) throw error(503, 'Project file unavailable');
  if (!row) throw error(404, 'Project file not found');
  const { data: blob, error: storageError } = await locals.supabase.storage
    .from(TOOLKIT_ASSET_BUCKET).download(row.storage_path);
  if (storageError || !blob) throw error(503, 'Project file could not be retrieved');
  const filename = row.file_name.replace(/[\r\n"\\]/g, '_');
  return new Response(await blob.arrayBuffer(), { status: 200, headers: {
    'Content-Type': row.mime_type,
    'Content-Disposition': `inline; filename="${filename}"`,
    'Content-Length': String(row.bytes),
    'Cache-Control': 'private, max-age=120',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  } });
};
