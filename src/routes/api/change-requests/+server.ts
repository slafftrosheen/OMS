/**
 * Change Requests API
 * Handles CRUD operations for PR-style change requests
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// GET /api/change-requests - List all CRs with filters
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const orderId = url.searchParams.get('orderId');
  const status = url.searchParams.get('status');
  const station = url.searchParams.get('station');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('change_requests')
    .select(`
      *,
      proposed_by_user:auth.users!change_requests_proposed_by_fkey(email, id),
      reviewed_by_user:auth.users!change_requests_reviewed_by_fkey(email, id),
      order:draft_orders(id, title, po_number),
      comments:cr_comments(count)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (orderId) query = query.eq('order_id', orderId);
  if (status) query = query.eq('status', status);
  if (station) query = query.eq('station', station);

  const { data, error: dbError, count } = await query;

  if (dbError) {
    console.error('[CR API] List error:', dbError);
    throw error(500, 'Failed to fetch change requests');
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

// POST /api/change-requests - Create new CR
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const { orderId, title, description, changes, station, priority } = body;

  // Validate required fields
  if (!orderId || !title || !changes) {
    throw error(400, 'Missing required fields: orderId, title, changes');
  }

  // Create CR using database function
  const { data, error: dbError } = await supabase
    .rpc('create_change_request', {
      p_order_id: orderId,
      p_title: title,
      p_description: description || '',
      p_changes: changes,
      p_station: station || 'UNKNOWN',
      p_priority: priority || 'normal'
    });

  if (dbError) {
    console.error('[CR API] Create error:', dbError);
    throw error(500, 'Failed to create change request');
  }

  // Fetch created CR with relations
  const { data: createdCR, error: fetchError } = await supabase
    .from('change_requests')
    .select(`
      *,
      proposed_by_user:auth.users!change_requests_proposed_by_fkey(email, id),
      order:draft_orders(id, title, po_number)
    `)
    .eq('id', data)
    .single();

  if (fetchError) {
    console.error('[CR API] Fetch created CR error:', fetchError);
  }

  return json({ data: createdCR || { id: data } }, { status: 201 });
};