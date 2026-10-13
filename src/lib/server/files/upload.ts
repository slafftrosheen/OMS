import { error as kitError, isHttpError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { logger } from '$lib/server/logging/logger';
import { buildOrderFileLink, formatFileRecord } from './contract';
import { ORDER_FILE_BUCKET, normalizeOrderFile, storedOrderFileKey, isOrderUuid,
  MAX_ORDER_FILE_BYTES } from './order-storage';
import { canManageOrderFile } from '$lib/server/order/draft-contract';

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
  const id=randomUUID();
  const storageKey=storedOrderFileKey(order.id,user.id,id,metadata.fileName);
  const buffer=Buffer.from(await candidate.arrayBuffer());
  const { error: storageError }=await locals.supabase.storage.from(ORDER_FILE_BUCKET)
    .upload(storageKey,buffer,{contentType:metadata.mime,upsert:false});
  if(storageError) {
    logger.error('Order Storage upload failed',storageError as Error,{ orderId:order.id });
    throw kitError(503,'Private files bucket unavailable; check Storage migration and policies');
  }
  let dbFileId:string|null=null;
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
    const { error:linkError }=await locals.supabase.from('order_files').insert(
      buildOrderFileLink(order.id,file.id,fileType,metadata.fileName)
    );
    if(linkError) throw new Error('Could not link file to this order');
    return {success:true,file:formatFileRecord({...file,file_type:fileType,
      display_name:metadata.fileName})};
  } catch(err) {
    if(dbFileId){
      const { error:dbCleanup }=await locals.supabase.from('files').delete().eq('id',dbFileId);
      if(dbCleanup) logger.error('Orphan order file metadata cleanup failed',dbCleanup,{orderId:order.id});
    }
    const { error:storageCleanup }=await locals.supabase.storage.from(ORDER_FILE_BUCKET).remove([storageKey]);
    if(storageCleanup) logger.error('Orphan order Storage cleanup failed',storageCleanup as Error,{orderId:order.id});
    throw kitError(503,'File could not be saved and linked to the order');
  }
}

export function rethrowUploadError(err: unknown): never {
  if(isHttpError(err)) throw err;
  logger.error('File upload error',err as Error);
  throw kitError(500,'File upload failed');
}
export function uploadSuccessStatus(): number { return 201; }
export { formatFileRecord };
