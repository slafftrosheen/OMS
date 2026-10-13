import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readOrderStoredFile, removeOrderStoredFile } from '$lib/server/files/order-storage';
import { canManageOrderFile } from '$lib/server/order/draft-contract';
import { safeDownloadFilename, formatFileRecord, canDeleteGlobalFile } from '$lib/server/files/contract';

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
      const buffer = await readOrderStoredFile(locals,file);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': file.mimetype || 'application/octet-stream',
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
    .select('id,draft_order_id')
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

  const { data: parents, error: parentsError } = await locals.supabase.from('draft_orders')
    .select('id,created_by,status').in('id',(links ?? []).map((link: any) => link.draft_order_id));
  if(parentsError || !parents || parents.length !== (links ?? []).length) {
    throw error(403,'Cannot validate permissions for every linked order');
  }
  if(!locals.user || parents.some(p => !canManageOrderFile(locals.user!.role,
      p.created_by,locals.user!.id,p.status))) {
    throw error(403,'Only authorized order editors can delete attached files');
  }

  // Review evidence is immutable: deleting the underlying Storage object
  // before checking FK-backed revision references would strand the audit.
  const { data: revisionRefs, error: revisionError }=await locals.supabase
    .from('order_revision_sources').select('change_request_id')
    .or(`baseline_file_id.eq.${params.id},revised_file_id.eq.${params.id}`)
    .limit(1);
  if(revisionError) throw error(503,'Cannot verify whether this file is revision evidence');
  if(revisionRefs?.length) throw error(409,
    'File is evidence in a revision change request and must be retained');

  try {
    await removeOrderStoredFile(locals,file);
  } catch (err) {
    console.error('Storage deletion failed:', err);
    throw error(500, 'Failed to delete file content');
  }

  const { error: deleteError } = await locals.supabase.from('files').delete().eq('id', params.id);
  if (deleteError) throw error(500, 'Failed to delete file metadata');
  return json({ success: true });
};
