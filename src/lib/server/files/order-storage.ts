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
      !(ext === 'dxf' && declared === 'application/x-dxf') &&
      !(ext === 'cdr' && ['application/coreldraw','application/x-coreldraw',
        'application/vnd.corel-draw'].includes(declared))) {
    throw new Error('File extension does not match its MIME type');
  }
  if (file.size < 1 || file.size > MAX_ORDER_FILE_BYTES) throw new Error('File must be 1 byte–25 MiB');
  const safeName=file.name.replace(/[\\/\r\n\0<>]/g,'_').slice(0,180);
  return { mime:expected, fileName:safeName, extension:ext };
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
