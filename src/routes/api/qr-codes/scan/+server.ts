/**
 * QR Scan API
 * Handles QR code scanning and action logging
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// POST /api/qr-codes/scan - Log QR scan and return order data
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const { 
    qrCode, 
    actionType = 'view', 
    actionData = null,
    station = null,
    notes = null,
    deviceInfo = null 
  } = body;

  if (!qrCode) {
    throw error(400, 'Missing required field: qrCode');
  }

  try {
    // Log scan using database function
    const { data: scanResult, error: dbError } = await supabase
      .rpc('log_qr_scan', {
        p_qr_code: qrCode,
        p_action_type: actionType,
        p_action_data: actionData,
        p_station: station,
        p_notes: notes,
        p_device_info: deviceInfo
      });

    if (dbError) {
      console.error('[QR Scan API] Error:', dbError);
      throw error(500, dbError.message || 'Failed to log scan');
    }

    // Fetch full order details
    const { data: order, error: orderError } = await supabase
      .from('draft_orders')
      .select(`
        *,
        loading_day:loading_days(date, notes),
        attachments:station_attachments(count)
      `)
      .eq('id', scanResult.orderId)
      .single();

    if (orderError) {
      console.error('[QR Scan API] Order fetch error:', orderError);
    }

    return json({
      data: {
        scan: scanResult,
        order: order || null
      }
    });

  } catch (err) {
    console.error('[QR Scan API] Error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to process scan');
  }
};