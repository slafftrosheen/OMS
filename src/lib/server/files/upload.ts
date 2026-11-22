import { error as kitError, isHttpError } from '@sveltejs/kit';
import { createHash, randomUUID } from 'node:crypto';
import { readCanvasDxfRelease } from '$lib/order/canvas-dxf-release';
import { PRODUCTION_FILE_POCKETS, type ProductionFilePocket } from '$lib/order/file-pockets';
import { logger } from '$lib/server/logging/logger';
import { buildOrderFileLink, formatFileRecord } from './contract';
import { ORDER_FILE_BUCKET, normalizeOrderFile, storedOrderFileKey, isOrderUuid,
  MAX_ORDER_FILE_BYTES, matchesOrderFileSignature } from './order-storage';
import { canManageOrderFile } from '$lib/server/order/draft-contract';

function parseRelease(value: FormDataEntryValue | null) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 3000) throw kitError(400, 'Invalid Canvas DXF review');
  let payload: unknown;
  try { payload = JSON.parse(value); } catch { throw kitError(400, 'Invalid Canvas DXF review'); }
  const release = readCanvasDxfRelease(payload);
  if (!release) throw kitError(400, 'Invalid Canvas DXF review');
  return release;
}

export function canvasDxfFileId(orderId: string, userId: string, pocket: string, filename: string, reviewId: string, bytes: Uint8Array): string {
  const digest = createHash('sha256').update(JSON.stringify([orderId, userId, pocket, filename, reviewId])).update(bytes).digest('hex');
  return `${digest.slice(0,8)}-${digest.slice(8,12)}-8${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
}

export async function uploadOrderFile(request: Request, locals: App.Locals) {
  const user = locals.user;
  if (!user) throw kitError(401, 'Unauthorized');
  // Check adapter limit before reading multipart: the global 32 MiB setting is
  // mandatory on the deployed Node process, not merely in .env.example.
  const ceiling = process.env.BODY_SIZE_LIMIT;
  if (!ceiling || !/^3[2-9]M$/i.test(ceiling.trim())) {
    // Non-Docker installations may have larger configured limits.
    const { toolkitUploadReadiness } = await import('$lib/server/toolkit/assets');
    if (!toolkitUploadReadiness(ceiling).ready) {
      throw kitError(503,'BODY_SIZE_LIMIT=32M must be set on the active OMS service');
    }
  }
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_ORDER_FILE_BYTES + 1024 * 1024) {
    throw kitError(413, 'Upload exceeds the 25 MiB limit');
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { throw kitError(413, 'Could not parse upload; check request/proxy body limits'); }
  const candidate=form.get('file');
  if (!(candidate instanceof File)) throw kitError(400,'No file provided');
  let metadata: ReturnType<typeof normalizeOrderFile>;
  try { metadata=normalizeOrderFile(candidate); }
  catch(err) { throw kitError(candidate.size>MAX_ORDER_FILE_BYTES ? 413 : 415,(err as Error).message); }

  const orderRef=String(form.get('order_id') ?? form.get('orderId') ?? '').trim();
  if (!orderRef || (!isOrderUuid(orderRef) && !/^[a-zA-Z0-9_.\/-]{1,16}$/.test(orderRef))) {
    throw kitError(400,'Valid order ID or PO required');
  }
  let query=locals.supabase.from('draft_orders').select('id,status,created_by').limit(1);
  query=isOrderUuid(orderRef) ? query.eq('id',orderRef) : query.eq('po_number',orderRef);
  const { data: order, error: orderError }=await query.maybeSingle();
  if (orderError) throw kitError(503,'Order database unavailable');
  if (!order) throw kitError(404,'Order not found or inaccessible');
  if (!canManageOrderFile(user.role, order.created_by,user.id,order.status)) {
    throw kitError(403,'File upload is not permitted for this role or order status');
  }

  const fileTypeRaw=String(form.get('file_type') ?? 'attachment').trim();
  const fileType=/^[a-zA-Z0-9_-]{1,60}$/.test(fileTypeRaw) ? fileTypeRaw : 'attachment';
  const release = parseRelease(form.get('canvas_dxf_release'));
  if (release && (metadata.extension !== 'dxf' || !PRODUCTION_FILE_POCKETS.includes(fileType as ProductionFilePocket))) {
    throw kitError(400, 'Canvas review metadata requires a DXF and a production pocket');
  }
  const buffer=Buffer.from(await candidate.arrayBuffer());
  if (!matchesOrderFileSignature(metadata.extension,buffer.subarray(0,4096))) {
    throw kitError(415,'File contents do not match the declared image/PDF/archive format');
  }
  if (release && (!buffer.subarray(0, 23).toString('ascii').startsWith('0\r\nSECTION\r\n2\r\nHEADER\r\n') ||
      !buffer.subarray(-8).toString('ascii').endsWith('\r\nEOF\r\n'))) {
    throw kitError(415, 'Reviewed Canvas releases require an ASCII OMS DXF');
  }
  const id = release ? canvasDxfFileId(order.id, user.id, fileType, metadata.fileName, release.reviewId, buffer) : randomUUID();
  if (release) {
    const { data: prior, error } = await locals.supabase.from('order_files')
      .select('file_type, display_name, files!inner(*)').eq('draft_order_id', order.id).eq('file_id', id).maybeSingle();
    if (error) throw kitError(503, 'Could not check the existing Canvas DXF release');
    if (prior) {
      const file = Array.isArray(prior.files) ? prior.files[0] : prior.files;
      if (!file || file.uploaded_by !== user.id ||
          JSON.stringify(readCanvasDxfRelease(file.metadata?.canvas_dxf_release)) !== JSON.stringify(release)) throw kitError(409, 'Canvas DXF review conflicts with an existing release');
      return { success: true, file: formatFileRecord({ ...file, file_type: prior.file_type, display_name: prior.display_name }) };
    }
  }
  // Competing uploads have independent storage keys; the database chooses one canonical file.
  const storageKey=storedOrderFileKey(order.id,user.id,release ? randomUUID() : id,metadata.fileName);
  const { error: storageError }=await locals.supabase.storage.from(ORDER_FILE_BUCKET)
    .upload(storageKey,buffer,{contentType:metadata.mime,upsert:false});
  if(storageError) {
    const status = String((storageError as { statusCode?: string | number }).statusCode ?? '');
    logger.error('Order Storage upload failed',storageError as Error,{
      orderId:order.id, statusCode:status
    });
    // Storage and the OMS upload endpoint have independent body limits and RLS.
    // Preserve these distinctions rather than flattening every cause to 503.
    if(status === '413') throw kitError(413,
      'Supabase Storage rejected the file size. Check its global and files-bucket size limits.');
    if(status === '401' || status === '403') throw kitError(503,
      'Supabase Storage denied this write. Check the private files bucket INSERT policy and session.');
    if(status === '404') throw kitError(503,
      'Private files Storage bucket not found. Inspect the applied Storage bucket migration.');
    throw kitError(503,
      'Private files upload failed. Check Supabase Storage logs and connectivity.');
  }
  if (release) {
    const { data: file, error } = await locals.supabase.rpc('register_canvas_dxf_release', {
      p_order_id: order.id, p_file_id: id, p_pocket: fileType, p_name: metadata.fileName,
      p_original_name: candidate.name.slice(0,255), p_storage_key: storageKey, p_size: buffer.length, p_release: release
    });
    if (error || !file) {
      logger.error('Canvas DXF release registration failed', error ?? new Error('Missing release response'), { orderId: order.id });
      // Only remove a blob when PostgreSQL explicitly rejected and rolled back the transaction.
      // A connection failure can occur after a successful commit.
      if (['22023', '23503', '23505', '42501', 'PGRST202'].includes(error?.code ?? '')) {
        const { error: cleanup } = await locals.supabase.storage.from(ORDER_FILE_BUCKET).remove([storageKey]);
        if (cleanup) logger.error('Unused Canvas DXF upload cleanup failed', cleanup as Error, { orderId: order.id });
      }
      if (error?.code === '23505') throw kitError(409, 'Canvas DXF review conflicts with an existing release');
      if (error?.code === '42501') throw kitError(403, 'Unable to link this DXF to the order');
      throw kitError(503, 'Could not register the reviewed DXF. Retry from the same review.');
    }
    if (file.filepath !== storageKey) {
      const { error: cleanup } = await locals.supabase.storage.from(ORDER_FILE_BUCKET).remove([storageKey]);
      if (cleanup) logger.error('Duplicate Canvas DXF upload cleanup failed', cleanup as Error, { orderId: order.id });
    }
    return { success: true, file: formatFileRecord(file) };
  }
  let dbFileId:string|null=null;
  let registrationPhase: 'files metadata' | 'order attachment link' = 'files metadata';
  try {
    const { data:file,error:fileError }=await locals.supabase.from('files').insert({
      filename:`${id}-${metadata.fileName}`,
      original_name:candidate.name.slice(0,255),
      filepath:storageKey,
      mimetype:metadata.mime,
      size:buffer.length,
      uploaded_by:user.id,
      metadata:{storage_key:storageKey,storage_bucket:ORDER_FILE_BUCKET}
    }).select('*').single();
    if(fileError || !file) throw new Error('Could not register file');
    dbFileId=file.id;
    registrationPhase = 'order attachment link';
    const { error:linkError }=await locals.supabase.from('order_files').insert(
      buildOrderFileLink(order.id,file.id,fileType,metadata.fileName)
    );
    if(linkError) throw new Error('Could not link file to this order');
    return {success:true,file:formatFileRecord({...file,file_type:fileType,
      display_name:metadata.fileName})};
  } catch(err) {
    logger.error('Order attachment registration failed',err as Error,{
      orderId:order.id, phase:registrationPhase
    });
    if(dbFileId){
      const { error:dbCleanup }=await locals.supabase.from('files').delete().eq('id',dbFileId);
      if(dbCleanup) logger.error('Orphan order file metadata cleanup failed',dbCleanup,{orderId:order.id});
    }
    const { error:storageCleanup }=await locals.supabase.storage.from(ORDER_FILE_BUCKET).remove([storageKey]);
    if(storageCleanup) logger.error('Orphan order Storage cleanup failed',storageCleanup as Error,{orderId:order.id});
    throw kitError(503,registrationPhase === 'files metadata'
      ? 'Could not register the uploaded file. Check files table INSERT permissions and schema.'
      : 'Could not link the uploaded file to the order. Check order_files INSERT permissions and schema.');
  }
}

export function rethrowUploadError(err: unknown): never {
  if(isHttpError(err)) throw err;
  logger.error('File upload error',err as Error);
  throw kitError(500,'File upload failed');
}
export function uploadSuccessStatus(): number { return 201; }
export { formatFileRecord };
