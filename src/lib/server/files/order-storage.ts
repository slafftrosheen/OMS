/** Order files are private Supabase Storage objects, never public URLs.
 * Request-scoped Supabase client supplies the authenticated user's RLS JWT.
 * The canonical parent is draft_orders.id both before and after confirmation.
 */
export const ORDER_FILE_BUCKET = 'files';
export const MAX_ORDER_FILE_BYTES = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME: Record<string,string> = {
 pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
 gif:'image/gif', webp:'image/webp', dxf:'application/dxf',
 cdr:'application/octet-stream', zip:'application/zip',
 docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 txt:'text/plain'
};
const ALLOWED = new Set(Object.values(MIME));
export function normalizeOrderFile(file: Pick<File,'name'|'type'|'size'>) {
  const ext=file.name.split('.').pop()?.toLowerCase() ?? '';
  const expected=MIME[ext];
  const declared=file.type.toLowerCase();
  if (!expected || !file.name.trim()) throw new Error('Unsupported file type');
  if (declared && declared !== 'application/octet-stream' && declared !== expected &&
      // Many CAD browsers report one of these for DXF/CDR.
      !(ext === 'dxf' && ['application/x-dxf','image/vnd.dxf'].includes(declared)) &&
      !(ext === 'cdr' && ['application/coreldraw','application/x-coreldraw',
        'application/vnd.corel-draw'].includes(declared))) {
    throw new Error('File extension does not match its MIME type');
  }
  if (file.size < 1 || file.size > MAX_ORDER_FILE_BYTES) throw new Error('File must be 1 byte–25 MiB');
  const safeName=file.name.replace(/[\\/\r\n\0<>]/g,'_').slice(0,180);
  return { mime:expected, fileName:safeName, extension:ext };
}
/** Verify common safe formats against magic bytes, not only browser headers.
 * Native CDR/DXF/plain text lack one universally reliable signature and
 * remain download-only content (not browser-executable inline HTML).
 */
export function matchesOrderFileSignature(extension: string, bytes: Uint8Array) {
  const b=bytes;
  const prefix=(t:string)=>t.split('').every((ch,i)=>b[i]===ch.charCodeAt(0));
  switch(extension) {
    case 'pdf': return prefix('%PDF-');
    case 'png': return b.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
    case 'jpg': case 'jpeg': return b[0]===255 && b[1]===216 && b[2]===255;
    case 'gif': return prefix('GIF87a') || prefix('GIF89a');
    case 'webp': return prefix('RIFF') && b[8]===87 && b[9]===69 && b[10]===66 && b[11]===80;
    case 'zip': case 'docx': case 'xlsx':
      return b[0]===80 && b[1]===75 && [3,5,7].includes(b[2]) && [4,6,8].includes(b[3]);
    default: return b.length>0;
  }
}
export function isOrderUuid(input: string) { return UUID.test(input); }
export function storedOrderFileKey(orderId:string,userId:string,fileId:string,filename:string) {
  if (![orderId,userId,fileId].every(isOrderUuid)) throw new Error('Invalid file identifier');
  const suffix=filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
  return `orders/${orderId}/${userId}/${fileId}-${suffix}`;
}
export function orderFileBucket(row: {metadata?:Record<string,unknown> | null}) {
  return row.metadata?.storage_bucket === ORDER_FILE_BUCKET ? ORDER_FILE_BUCKET : 'legacy';
}

/** Existing metadata may refer to the retired legacy order-files bucket
 * (or local StorageService fallback). Never rewrite old paths in place.
 * Use request-scoped authenticated Storage for all new and legacy Supabase
 * objects, with the historic local fallback strictly for old objects.
 */
export async function readOrderStoredFile(locals: App.Locals, row: Record<string, any>, maxBytes?:number) {
  const bucket=orderFileBucket(row);
  const key=typeof row.metadata?.storage_key === 'string' && row.metadata.storage_key
    ? row.metadata.storage_key : row.filepath;
  if(typeof key !== 'string' || !key.startsWith('orders/')) throw new Error('Invalid file path');
  const candidates=bucket === ORDER_FILE_BUCKET ? [ORDER_FILE_BUCKET] : ['order-files','files'];
  for(const candidate of candidates){
    const { data, error }=await locals.supabase.storage.from(candidate).download(key);
    if(!error && data) {
      if(maxBytes!==undefined && data.size>maxBytes)
        throw new Error('Order file exceeds the analysis limit');
      return Buffer.from(await data.arrayBuffer());
    }
  }
  if(bucket !== ORDER_FILE_BUCKET) {
    // Previous releases could save local files when Supabase was disabled.
    // No new upload uses the fallback; only historical files may need it.
    const { storageService }=await import('$lib/server/storage/StorageService');
    const result=(await storageService.download(key)).buffer;
    if(maxBytes!==undefined && result.length>maxBytes)
      throw new Error('Legacy order file exceeds the analysis limit');
    return result;
  }
  throw new Error('Stored file is unavailable');
}
export async function removeOrderStoredFile(locals: App.Locals, row: Record<string, any>) {
  const bucket=orderFileBucket(row);
  const key=typeof row.metadata?.storage_key === 'string' && row.metadata.storage_key
    ? row.metadata.storage_key : row.filepath;
  if(typeof key !== 'string' || !key.startsWith('orders/')) throw new Error('Invalid file path');
  if(bucket === ORDER_FILE_BUCKET) {
    const { error }=await locals.supabase.storage.from(ORDER_FILE_BUCKET).remove([key]);
    if(error) throw error;
    return;
  }
  // Use historic storage service only for objects created by its legacy path.
  const { storageService }=await import('$lib/server/storage/StorageService');
  await storageService.delete(key);
}
