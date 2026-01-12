// src/routes/api/calendar/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/calendar - List calendar events
 * Query params: ?from=2025-01-01&to=2025-12-31&kind=loading
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const kind = url.searchParams.get('kind');

  let query = supabase
    .from('calendar_events')
    .select(`
      id,
      kind,
      date,
      title,
      note,
      created_at,
      loading_events (
        carrier,
        window_start,
        window_end,
        loading_event_pos (
          draft_orders (
            po_number
          )
        )
      ),
      meeting_events (
        start_time,
        end_time,
        location,
        attendees
      )
    `);

  if (from) {
    query = query.gte('date', from);
  }
  if (to) {
    query = query.lte('date', to);
  }
  if (kind) {
    query = query.eq('kind', kind);
  }

  query = query.order('date', { ascending: true }).order('created_at', { ascending: true });

  const { data: events, error } = await query;

  if (error) {
    console.error('Failed to fetch calendar events:', error);
    return json([], { status: 500 });
  }

  const formattedEvents = events.map(event => {
    const base = {
      id: event.id,
      kind: event.kind,
      date: event.date?.slice(0, 10),
      createdAt: event.created_at,
      note: event.note
    };

    if (event.kind === 'loading' && event.loading_events) {
      return {
        ...base,
        poList: event.loading_events.loading_event_pos.map(lep => lep.draft_orders.po_number),
        carrier: event.loading_events.carrier,
        window: {
          start: event.loading_events.window_start?.slice(0, 5),
          end: event.loading_events.window_end?.slice(0, 5)
        }
      };
    }

    if (event.kind === 'meeting' && event.meeting_events) {
      return {
        ...base,
        title: event.title,
        start: event.meeting_events.start_time?.slice(0, 5),
        end: event.meeting_events.end_time?.slice(0, 5),
        location: event.meeting_events.location,
        attendees: event.meeting_events.attendees
      };
    }

    return {
      ...base,
      title: event.title
    };
  });

  return json(formattedEvents);
};

/**
 * POST /api/calendar - Create calendar event
 */
export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
  const data = await request.json();

  if (!data.date || !data.kind) {
    return json({ error: 'Date and kind are required' }, { status: 400 });
  }

  const { data: event, error: eventError } = await supabase
    .from('calendar_events')
    .insert({
      kind: data.kind,
      date: data.date,
      title: data.title || '',
      note: data.note || ''
    })
    .select()
    .single();

  if (eventError) {
    console.error('Failed to create calendar event:', eventError);
    return json({ error: 'Failed to create event' }, { status: 500 });
  }

  if (data.kind === 'loading') {
    const { error: loadingError } = await supabase
      .from('loading_events')
      .insert({
        id: event.id,
        carrier: data.carrier || '',
        window_start: data.window?.start || null,
        window_end: data.window?.end || null
      });

    if (loadingError) {
      console.error('Failed to create loading event details:', loadingError);
      // Rollback logic might be needed here in a real-world scenario
    }

    if (data.poList && Array.isArray(data.poList)) {
      const { data: orders } = await supabase
        .from('draft_orders')
        .select('id')
        .in('po_number', data.poList);

      if (orders) {
        await supabase
          .from('loading_event_pos')
          .insert(orders.map(o => ({
            loading_event_id: event.id,
            draft_order_id: o.id
          })));
      }
    }
  } else if (data.kind === 'meeting') {
    const { error: meetingError } = await supabase
      .from('meeting_events')
      .insert({
        id: event.id,
        start_time: data.start || null,
        end_time: data.end || null,
        location: data.location || '',
        attendees: data.attendees || []
      });

    if (meetingError) {
      console.error('Failed to create meeting event details:', meetingError);
      // Rollback logic might be needed here
    }
  }

  return json({
    id: event.id,
    kind: event.kind,
    date: event.date?.slice(0, 10),
    title: event.title,
    note: event.note,
    createdAt: event.created_at
  }, { status: 201 });
};
