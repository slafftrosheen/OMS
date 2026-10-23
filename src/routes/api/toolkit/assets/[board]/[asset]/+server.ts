import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { isUuid, TOOLKIT_ASSET_BUCKET, toolkitByteRange } from '$lib/server/toolkit/assets';

export const GET: RequestHandler = async ({ params, locals, request }) => {
  requireToolkitManager(locals.user);
  if (!isUuid(params.board) || !isUuid(params.asset)) throw error(400, 'Invalid file reference');
  const { data: row, error: metaError } = await locals.supabase.from('toolkit_assets')
    .select('storage_path,mime_type,file_name,bytes')
    .eq('id', params.asset).eq('canvas_id', params.board).maybeSingle();
  if (metaError) throw error(503, 'Project file unavailable');
  if (!row) throw error(404, 'Project file not found');
  const range = toolkitByteRange(request.headers.get('range'), row.bytes);
  if (range === false) return new Response(null, { status: 416, headers: {
    'Content-Range': `bytes */${row.bytes}`, 'Cache-Control': 'private, no-store'
  } });
  const { data: blob, error: storageError } = await locals.supabase.storage
    .from(TOOLKIT_ASSET_BUCKET).download(row.storage_path);
  if (storageError || !blob) throw error(503, 'Project file could not be retrieved');
  // Metadata/storage mismatches should never be served as truncated PDFs
  // (nor produce incorrect Content-Length response framing).
  if (blob.size !== row.bytes) throw error(503, 'Stored project file size mismatch');
  // HTTP Headers are ByteString values in Node. A raw Cyrillic/Latvian file
  // name throws before the PDF/video response can be returned. Keep an ASCII
  // fallback and carry the original Unicode name in RFC 5987 encoding.
  const filename = String(row.file_name || 'file').replace(/[\u0000-\u001f\u007f]/g, '_').toWellFormed();
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encodedFilename = encodeURIComponent(filename).replace(/['()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const body = range ? blob.slice(range.start, range.end + 1) : blob;
  return new Response(body, { status: range ? 206 : 200, headers: {
    'Content-Type': row.mime_type,
    'Content-Disposition': `inline; filename="${fallback}"; filename*=UTF-8''${encodedFilename}`,
    'Content-Length': String(body.size),
    'Accept-Ranges': 'bytes',
    ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${row.bytes}` } : {}),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  } });
};

export const HEAD: RequestHandler = async ({ params, locals }) => {
  requireToolkitManager(locals.user);
  if (!isUuid(params.board) || !isUuid(params.asset)) throw error(400, 'Invalid file reference');
  const { data: row, error: metaError } = await locals.supabase.from('toolkit_assets')
    .select('mime_type,bytes').eq('id', params.asset).eq('canvas_id', params.board).maybeSingle();
  if (metaError) throw error(503, 'Project file unavailable');
  if (!row) throw error(404, 'Project file not found');
  return new Response(null, { headers: { 'Content-Type': row.mime_type,
    'Content-Length': String(row.bytes), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' } });
};
