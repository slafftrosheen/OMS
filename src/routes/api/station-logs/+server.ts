/**
 * Station Logs API
 * Comprehensive logging for station activities
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// GET /api/station-logs - Get station logs with filters
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const orderId = url.searchParams.get('orderId');
  const station = url.searchParams.get('station');
  const logType = url.searchParams.get('type');
  const issuesOnly = url.searchParams.get('issuesOnly') === 'true';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('station_timeline')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (orderId) query = query.eq('order_id', orderId);
  if (station) query = query.eq('station', station);
  if (logType) query = query.eq('log_type', logType);
  if (issuesOnly) query = query.eq('is_issue', true);

  const { data, error: dbError, count } = await query;

  if (dbError) {
    console.error('[Station Logs API] Error:', dbError);
    throw error(500, 'Failed to fetch station logs');
  }

  return json({
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit)
    }
  });
};

// POST /api/station-logs - Create station log
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    orderId,
    station,
    logType,
    message,
    newStage = null,
    details = null,
    qualityScore = null,
    isIssue = false,
    tags = []
  } = body;

  if (!orderId || !station || !logType || !message) {
    throw error(400, 'Missing required fields: orderId, station, logType, message');
  }

  try {
    const { data: logId, error: dbError } = await supabase
      .rpc('create_station_log', {
        p_order_id: orderId,
        p_station: station,
        p_log_type: logType,
        p_message: message,
        p_new_stage: newStage,
        p_details: details,
        p_quality_score: qualityScore,
        p_is_issue: isIssue,
        p_tags: tags
      });

    if (dbError) {
      console.error('[Station Logs API] Create error:', dbError);
      throw error(500, 'Failed to create station log');
    }

    // Fetch created log
    const { data: log, error: fetchError } = await supabase
      .from('station_timeline')
      .select('*')
      .eq('id', logId)
      .single();

    if (fetchError) {
      console.error('[Station Logs API] Fetch error:', fetchError);
    }

    return json({ data: log }, { status: 201 });

  } catch (err) {
    console.error('[Station Logs API] Error:', err);
    throw error(500, 'Failed to create station log');
  }
};