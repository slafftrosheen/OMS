import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { storageService } from '$lib/server/storage/StorageService';
import { safeDownloadFilename, storageKeyFromFileRow, formatFileRecord, canDeleteGlobalFile } from '$lib/server/files/contract';

async function getAccessibleFile(locals: App.Locals, fileId: string) {
  const { data: links, error: linkError } = await locals.supabase
    .from('order_files')
    .select('draft_order_id, files!inner(*)')
    .eq('file_id', fileId);
  if (linkError || !links?.length) return null;

  // The junction SELECT policy enforces role-aware access to linked orders.
  const first = links[0] as any;
  const file = Array.isArray(first.files) ? first.files[0] : first.files;
  return file ?? null;
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const file = await getAccessibleFile(locals, params.id);
  if (!file) throw error(404, 'File not found');

  if (url.searchParams.get('download') === 'true') {
    try {
      const key = storageKeyFromFileRow(file);
      const { buffer, metadata } = await storageService.download(key);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': file.mimetype || metadata.contentType || 'application/octet-stream',
          'Content-Length': String(buffer.length),
          'Content-Disposition': `attachment; filename="${safeDownloadFilename(file.original_name || file.filename)}"`,
          'Cache-Control': 'private, no-store'
        }
      });
    } catch {
      throw error(404, 'File content not found');
    }
  }

  return json(formatFileRecord(file));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const file = await getAccessibleFile(locals, params.id);
  if (!file) throw error(404, 'File not found');

  const { data: links, error: linksError } = await locals.supabase
    .from('order_files')
    .select('id')
    .eq('file_id', params.id);
  if (linksError) throw error(500, 'Failed to verify file links');

  // This shared file record may be attached to several orders. Only delete it
  // when every link is visible and the caller is authorized for every parent.
  const { count, error: countError } = await locals.supabase
    .from('order_files')
    .select('id', { count: 'exact', head: true })
    .eq('file_id', params.id);
  if (countError || !canDeleteGlobalFile(count ?? 0, links?.length ?? 0)) {
    throw error(403, 'Cannot delete a file linked to an inaccessible order');
  }

  try {
    await storageService.delete(storageKeyFromFileRow(file));
  } catch (err) {
    console.error('Storage deletion failed:', err);
    throw error(500, 'Failed to delete file content');
  }

  const { error: deleteError } = await locals.supabase.from('files').delete().eq('id', params.id);
  if (deleteError) throw error(500, 'Failed to delete file metadata');
  return json({ success: true });
};
