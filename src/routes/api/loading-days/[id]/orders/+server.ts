// src/routes/api/loading-days/[id]/orders/+server.ts
//
// POST: assign an order to a loading day. Creates the loading_event_pos
// row + flips the order's status to READY_TO_LOAD and stamps loading_date.
// DELETE: unassign.
//
// Loading-day assignment is manual only (HoP/Boss). Operators cannot
// assign.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PRIVILEGED_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);

async function requirePrivileged(locals: App.Locals) {
  const session = await locals.getSession();
  if (!session) return { error: 'Unauthorized', status: 401 as const };
  const { data: actor } = await locals.supabase
    .from('profiles')
    .select('id, role')
    .eq('id', session.user.id)
    .single();
  if (!actor || !PRIVILEGED_ROLES.has(actor.role)) {
    return { error: 'Forbidden', status: 403 as const };
  }
  return { actor };
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const auth = await requirePrivileged(locals);
  if ('error' in auth) return json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const orderId: string | null = body.orderId ?? null;
  if (!orderId) return json({ error: 'orderId required' }, { status: 400 });

  // Resolve loading day → calendar event id (loading_event_pos lives on
  // the calendar_events FK chain in the existing schema).
  const { data: day } = await locals.supabase
    .from('loading_days')
    .select('id, date')
    .eq('id', params.id)
    .single();
  if (!day) return json({ error: 'Loading day not found' }, { status: 404 });

  // Find or create the matching loading_event for this date.
  let loadingEventId: string | null = null;
  const { data: existingEvent } = await locals.supabase
    .from('calendar_events')
    .select('id')
    .eq('kind', 'loading')
    .eq('date', day.date)
    .limit(1)
    .single();
  if (existingEvent) {
    loadingEventId = existingEvent.id;
  } else {
    const { data: newEvent, error: insertErr } = await locals.supabase
      .from('calendar_events')
      .insert({
        kind: 'loading',
        date: day.date,
        title: `Loading ${day.date}`,
        created_by: auth.actor.id,
      })
      .select('id')
      .single();
    if (insertErr || !newEvent) {
      console.error('calendar_events insert failed:', insertErr);
      return json({ error: 'Failed to anchor loading event' }, { status: 500 });
    }
    loadingEventId = newEvent.id;

    // Mirror into loading_events for the carrier metadata table.
    await locals.supabase.from('loading_events').insert({
      id: newEvent.id,
      carrier: body.carrier ?? null,
      window_start: body.windowStart ?? null,
      window_end: body.windowEnd ?? null,
      notes: body.notes ?? null,
    }).then(({ error }) => { if (error) console.error('loading_events insert failed:', error); });
  }

  // Link order to event (idempotent).
  const { error: linkErr } = await locals.supabase
    .from('loading_event_pos')
    .upsert({
      loading_event_id: loadingEventId,
      draft_order_id: orderId,
    }, { onConflict: 'loading_event_id,draft_order_id' });
  if (linkErr) {
    console.error('loading_event_pos upsert failed:', linkErr);
    return json({ error: 'Failed to assign order' }, { status: 500 });
  }

  // Flip status + stamp loading_date.
  const { data: order } = await locals.supabase
    .from('draft_orders')
    .select('status')
    .eq('id', orderId)
    .single();
  if (order && order.status !== 'DISPATCHED' && order.status !== 'ARCHIVED' && order.status !== 'VOIDED') {
    await locals.supabase
      .from('draft_orders')
      .update({
        status: 'READY_TO_LOAD',
        loading_date: day.date,
        updated_by: auth.actor.id,
      })
      .eq('id', orderId);
  }

  return json({ ok: true, loadingEventId, date: day.date });
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
  const auth = await requirePrivileged(locals);
  if ('error' in auth) return json({ error: auth.error }, { status: auth.status });

  const orderId = url.searchParams.get('orderId');
  if (!orderId) return json({ error: 'orderId required' }, { status: 400 });

  const { data: day } = await locals.supabase
    .from('loading_days')
    .select('date')
    .eq('id', params.id)
    .single();
  if (!day) return json({ error: 'Loading day not found' }, { status: 404 });

  const { data: ev } = await locals.supabase
    .from('calendar_events')
    .select('id')
    .eq('kind', 'loading')
    .eq('date', day.date)
    .limit(1)
    .single();
  if (ev) {
    await locals.supabase
      .from('loading_event_pos')
      .delete()
      .eq('loading_event_id', ev.id)
      .eq('draft_order_id', orderId);
  }

  // Roll status back to IN_PRODUCTION (or CONFIRMED) so it leaves the
  // ready-to-load queue without skipping ahead.
  const { data: order } = await locals.supabase
    .from('draft_orders')
    .select('status')
    .eq('id', orderId)
    .single();
  if (order?.status === 'READY_TO_LOAD') {
    await locals.supabase
      .from('draft_orders')
      .update({
        status: 'IN_PRODUCTION',
        loading_date: null,
        updated_by: auth.actor.id,
      })
      .eq('id', orderId);
  }

  return json({ ok: true });
};
