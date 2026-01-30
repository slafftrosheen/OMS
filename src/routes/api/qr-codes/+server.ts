/**
 * QR Codes API
 * Handles QR code generation, scanning, and management
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';
import QRCode from 'qrcode';

// GET /api/qr-codes - List QR codes
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const orderId = url.searchParams.get('orderId');
  const active = url.searchParams.get('active') === 'true';

  let query = supabase
    .from('order_qr_codes')
    .select(`
      *,
      order:draft_orders(id, po_number, title),
      scan_stats:qr_scan_statistics(*)
    `)
    .order('generated_at', { ascending: false });

  if (orderId) query = query.eq('order_id', orderId);
  if (active) query = query.eq('is_active', true);

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('[QR API] List error:', dbError);
    throw error(500, 'Failed to fetch QR codes');
  }

  return json({ data });
};

// POST /api/qr-codes - Generate QR code
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const { orderId, size = 300 } = body;

  if (!orderId) {
    throw error(400, 'Missing required field: orderId');
  }

  try {
    // Generate QR code using database function
    const { data: qrCodeId, error: dbError } = await supabase
      .rpc('generate_order_qr_code', {
        p_order_id: orderId,
        p_format: 'QR'
      });

    if (dbError) {
      console.error('[QR API] Generation error:', dbError);
      throw error(500, dbError.message || 'Failed to generate QR code');
    }

    // Fetch the created QR code
    const { data: qrCode, error: fetchError } = await supabase
      .from('order_qr_codes')
      .select('*')
      .eq('id', qrCodeId)
      .single();

    if (fetchError || !qrCode) {
      throw error(500, 'Failed to fetch generated QR code');
    }

    // Generate QR code image (browser-compatible)
    // Use SVG to avoid canvas dependency
    const svgString = await QRCode.toString(qrCode.qr_code, {
      type: 'svg',
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;

    return json({
      data: {
        ...qrCode,
        imageUrl: imageDataUrl
      }
    }, { status: 201 });

  } catch (err) {
    console.error('[QR API] Error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to generate QR code');
  }
};