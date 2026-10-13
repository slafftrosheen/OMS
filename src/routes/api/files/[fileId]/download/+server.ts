import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readOrderStoredFile } from '$lib/server/files/order-storage';
import { safeDownloadFilename } from '$lib/server/files/contract';

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
    // Authenticated binary proxy; never issue long-lived signed URLs.
    const buffer = await readOrderStoredFile(locals,file);
    const disposition = inline ? 'inline' : 'attachment';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': file.mimetype || 'application/octet-stream',
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
