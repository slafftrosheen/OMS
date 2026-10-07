import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import QRCode from 'qrcode';
import { isValidOrderId, qrLabelFromOrder } from '$lib/server/api-contracts';

export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');
  const orderId = url.searchParams.get('orderId');
  let query = locals.supabase.from('order_qr_codes').select('*, order:draft_orders(id, po_number, title)').order('created_at', { ascending: false });
  if (orderId) {
    if (!isValidOrderId(orderId)) throw error(400, 'Invalid orderId');
    query = query.eq('order_id', orderId);
  }

  const { data, error: queryError } = await query;
  if (queryError) {
    console.error('[QR API] List error:', queryError);
    throw error(500, 'Failed to fetch QR codes');
  }
  return json({ data: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid request body');
  const orderId = body.orderId;
  const size = typeof body.size === 'number' && Number.isInteger(body.size) && body.size >= 128 && body.size <= 1024 ? body.size : 300;
  if (!isValidOrderId(orderId)) throw error(400, 'Invalid orderId');

  const { data: order, error: orderError } = await locals.supabase.from('draft_orders').select('id, po_number').eq('id', orderId).single();
  if (orderError || !order) throw error(404, 'Order not found or inaccessible');

  const { data: qrCode, error: rpcError } = await locals.supabase.rpc('generate_order_qr_code', {
    p_order_id: order.id,
    p_label: qrLabelFromOrder(order.po_number)
  });
  if (rpcError || !qrCode) {
    console.error('[QR API] Generation error:', rpcError);
    throw error(500, 'Failed to generate QR code');
  }

  const svgString = await QRCode.toString(qrCode.code, {
    type: 'svg', width: size, margin: 2, errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' }
  });
  const imageUrl = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;
  return json({ data: { ...qrCode, imageUrl } }, { status: 201 });
};
