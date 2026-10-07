import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { storageService } from '$lib/server/storage/StorageService';
import { safeDownloadFilename, storageKeyFromFileRow } from '$lib/server/files/contract';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const inline = url.searchParams.get('inline') === 'true';
  const { data: links, error: linkError } = await locals.supabase
    .from('order_files')
    .select('draft_order_id, files!inner(*)')
    .eq('file_id', params.fileId);
  if (linkError || !links?.length) throw error(404, 'File not found');

  // Selecting the order_files link is subject to role-aware order access RLS.
  const link = links[0] as any;
  const file = Array.isArray(link.files) ? link.files[0] : link.files;
  if (!file) throw error(404, 'File not found');

  try {
    const key = storageKeyFromFileRow(file);
    if (url.searchParams.get('redirect') === 'true') {
      const signed = await storageService.getSignedUrl(key, 3600);
      return new Response(null, { status: 302, headers: { Location: signed, 'Cache-Control': 'private, no-store' } });
    }

    const { buffer, metadata } = await storageService.download(key);
    const disposition = inline ? 'inline' : 'attachment';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': file.mimetype || metadata.contentType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${disposition}; filename="${safeDownloadFilename(file.original_name || file.filename)}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (err) {
    console.error('File download failed:', err);
    throw error(404, 'File content not found');
  }
};
