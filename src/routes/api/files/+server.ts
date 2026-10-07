import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadOrderFile, rethrowUploadError, uploadSuccessStatus } from '$lib/server/files/upload';
import { formatFileRecord } from '$lib/server/files/contract';

export const GET: RequestHandler = async ({ url, locals }) => {
  const orderRef = url.searchParams.get('orderId') ?? url.searchParams.get('order_id');
  if (!orderRef?.trim()) throw error(400, 'orderId is required');

  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
  const rawOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

  let orderQuery = locals.supabase.from('draft_orders').select('id').limit(1);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderRef)) {
    orderQuery = orderQuery.eq('id', orderRef);
  } else {
    orderQuery = orderQuery.eq('po_number', orderRef);
  }
  const { data: order, error: orderError } = await orderQuery.maybeSingle();
  if (orderError || !order) throw error(404, 'Order not found or inaccessible');

  const { data: links, error: filesError } = await locals.supabase
    .from('order_files')
    .select('file_type, display_name, files!inner(id, filename, original_name, filepath, mimetype, size, uploaded_by, created_at, metadata)')
    .eq('draft_order_id', order.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filesError) {
    console.error('Failed to list order files:', filesError);
    throw error(500, 'Failed to list order files');
  }

  return json((links ?? []).map((link: any) => {
    const file = Array.isArray(link.files) ? link.files[0] : link.files;
    return formatFileRecord({ ...file, file_type: link.file_type, display_name: link.display_name });
  }).filter((row: any) => row.id));
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const result = await uploadOrderFile(request, locals);
    return json(result.file, { status: uploadSuccessStatus() });
  } catch (err) {
    rethrowUploadError(err);
  }
};
