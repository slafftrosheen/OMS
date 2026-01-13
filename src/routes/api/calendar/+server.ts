// src/routes/api/calendar/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/calendar - List calendar events
 * Query params: ?from=2025-01-01&to=2025-12-31&kind=loading
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const kind = url.searchParams.get('kind');

  try {
    let query = locals.supabase
      .from('calendar_events')
      .select(`
        *,
        loading_events(*, loading_event_pos(draft_order_id, draft_orders(po_number))),
        meeting_events(*)
      `)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (kind) query = query.eq('kind', kind);

    const { data: events, error } = await query;

    if (error) {
       console.error('Failed to fetch calendar events:', error);
       throw error;
    }

    const formattedEvents = events.map(event => {
      const base = {
        id: event.id,
        kind: event.kind,
        date: event.date,
        createdAt: event.created_at,
        note: event.note
      };

      if (event.kind === 'loading' && event.loading_events) {
        const le = event.loading_events; // Assuming single relation via 1-to-1 linkage if set up
        // Note: Supabase/PostgREST returns an object for 1-to-1 or array for 1-to-many.
        // Assuming array if not explicitly unique, but here it's ID-to-ID.
        // Let's assume it might be an array if using 'has_many' style inference or object if 'belongs_to'.
        // Since both share ID, it's 1-to-1.
        const leData = Array.isArray(le) ? le[0] : le;

        const poList = leData?.loading_event_pos?.map((lep: any) => lep.draft_orders?.po_number).filter(Boolean) || [];

        return {
          ...base,
          poList: poList,
          carrier: leData?.carrier,
          window: {
            start: leData?.window_start?.slice(0, 5),
            end: leData?.window_end?.slice(0, 5)
          }
        };
      }

      if (event.kind === 'meeting' && event.meeting_events) {
        const me = event.meeting_events;
        const meData = Array.isArray(me) ? me[0] : me;
        return {
          ...base,
          title: event.title,
          start: meData?.start_time?.slice(0, 5),
          end: meData?.end_time?.slice(0, 5),
          location: meData?.location,
          attendees: meData?.attendees
        };
      }

      return {
        ...base,
        title: event.title
      };
    });

    return json(formattedEvents);
  } catch (err) {
    console.error('Failed to fetch calendar events:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/calendar - Create calendar event
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  if (!data.date || !data.kind) {
    return json({ error: 'Date and kind are required' }, { status: 400 });
  }

  try {
    // 1. Insert calendar_event
    const { data: newEvent, error: eventError } = await locals.supabase
      .from('calendar_events')
      .insert({
        kind: data.kind,
        date: data.date,
        title: data.title || '',
        note: data.note || ''
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // 2. Insert subtype
    if (data.kind === 'loading') {
      const { error: leError } = await locals.supabase
        .from('loading_events')
        .insert({
          id: newEvent.id,
          carrier: data.carrier || '',
          window_start: data.window?.start || null,
          window_end: data.window?.end || null
        });

      if (leError) throw leError;

      if (data.poList && Array.isArray(data.poList) && data.poList.length > 0) {
        // Fetch order IDs
        const { data: orders } = await locals.supabase
            .from('draft_orders')
            .select('id')
            .in('po_number', data.poList);

        if (orders && orders.length > 0) {
            const posToInsert = orders.map(o => ({
                loading_event_id: newEvent.id,
                draft_order_id: o.id
            }));
            const { error: posError } = await locals.supabase
                .from('loading_event_pos')
                .insert(posToInsert);
            if (posError) throw posError;
        }
      }
    } else if (data.kind === 'meeting') {
      const { error: meError } = await locals.supabase
        .from('meeting_events')
        .insert({
          id: newEvent.id,
          start_time: data.start || null,
          end_time: data.end || null,
          location: data.location || '',
          attendees: data.attendees || []
        });

      if (meError) throw meError;
    }

    return json({
      id: newEvent.id,
      kind: newEvent.kind,
      date: newEvent.date,
      title: newEvent.title,
      note: newEvent.note,
      createdAt: newEvent.created_at
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create calendar event:', err);
    return json({ error: 'Failed to create event' }, { status: 500 });
  }
};
