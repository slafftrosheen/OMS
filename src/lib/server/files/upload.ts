import { error as kitError, isHttpError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { storageService } from '$lib/server/storage/StorageService';
import { logger } from '$lib/server/logging/logger';
import { buildOrderFileLink, formatFileRecord } from './contract';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'text/plain', 'application/x-dxf', 'application/dxf'
]);

function safeFilenameSegment(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload';
}

export async function uploadOrderFile(request: Request, locals: App.Locals) {
  const user = locals.user;
  if (!user) throw kitError(401, 'Unauthorized');

  let storageKey: string | null = null;
  let fileId: string | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get('file');
    if (!(candidate instanceof File)) throw kitError(400, 'No file provided');
    const orderRef = String(form.get('order_id') ?? form.get('orderId') ?? '').trim();
    if (!orderRef) throw kitError(400, 'Order ID is required');
    if (candidate.size > MAX_FILE_SIZE) throw kitError(413, 'File too large. Maximum size is 50MB');
    if (!ALLOWED_TYPES.has(candidate.type)) throw kitError(415, `File type ${candidate.type || 'unknown'} not allowed`);

    let orderQuery = locals.supabase.from('draft_orders').select('id').limit(1);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderRef)) {
      orderQuery = orderQuery.eq('id', orderRef);
    } else {
      orderQuery = orderQuery.eq('po_number', orderRef);
    }
    const { data: order, error: orderError } = await orderQuery.maybeSingle();
    if (orderError || !order) throw kitError(404, 'Order not found or inaccessible');

    const fileType = String(form.get('file_type') ?? 'attachment').trim().slice(0, 80) || 'attachment';
    const displayName = safeFilenameSegment(candidate.name);
    const uploaded = await storageService.upload(candidate, order.id, user.id, {
      contentType: candidate.type,
      metadata: { 'file-type': fileType, 'original-name': displayName }
    });
    storageKey = uploaded.key;

    const { data: file, error: fileError } = await locals.supabase.from('files').insert({
      filename: `${randomUUID()}-${displayName}`,
      original_name: candidate.name,
      filepath: uploaded.key,
      mimetype: uploaded.contentType,
      size: uploaded.size,
      uploaded_by: user.id,
      metadata: { storage_key: uploaded.key }
    }).select('*').single();
    if (fileError || !file) throw fileError ?? new Error('Failed to save file metadata');
    fileId = file.id;

    const { error: linkError } = await locals.supabase.from('order_files').insert(
      buildOrderFileLink(order.id, file.id, fileType, displayName)
    );
    if (linkError) throw linkError;

    return { success: true, file: formatFileRecord({ ...file, file_type: fileType, display_name: displayName }) };
  } catch (err) {
    if (fileId) await locals.supabase.from('files').delete().eq('id', fileId);
    if (storageKey) {
      try { await storageService.delete(storageKey); }
      catch (cleanupErr) { logger.error('Failed to clean up file after upload error', cleanupErr as Error, { storageKey }); }
    }
    throw err;
  }
}

export function rethrowUploadError(err: unknown): never {
  if (isHttpError(err)) throw err;
  logger.error('File upload error', err as Error);
  throw kitError(500, 'File upload failed');
}

export function uploadSuccessStatus(): number { return 201; }

export { formatFileRecord };
