// src/routes/api/calendar/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/calendar/[id] - Get single event
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params;

  try {
    const { data: event, error: fetchError } = await locals.supabase
      .from('calendar_events')
      .select(`
        *,
        loading_events(*, loading_event_pos(draft_order_id, draft_orders(po_number))),
        meeting_events(*)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !event) {
       return json({ error: 'Event not found' }, { status: 404 });
    }

    let poList: string[] = [];
    let carrier: string | null = null, windowStart: string | null = null, windowEnd: string | null = null;
    let startTime: string | null = null, endTime: string | null = null, location: string | null = null, attendees: string[] | null = null;

    if (event.kind === 'loading' && event.loading_events) {
       const le = Array.isArray(event.loading_events) ? event.loading_events[0] : event.loading_events;
       if (le) {
          poList = le.loading_event_pos?.map((lep: any) => lep.draft_orders?.po_number).filter(Boolean) || [];
          carrier = le.carrier;
          windowStart = le.window_start;
          windowEnd = le.window_end;
       }
    } else if (event.kind === 'meeting' && event.meeting_events) {
       const me = Array.isArray(event.meeting_events) ? event.meeting_events[0] : event.meeting_events;
       if (me) {
          startTime = me.start_time;
          endTime = me.end_time;
          location = me.location;
          attendees = me.attendees;
       }
    }

    return json({
      id: event.id,
      kind: event.kind,
      date: event.date,
      title: event.title,
      note: event.note,
      createdAt: event.created_at,
      poList,
      carrier,
      window: (windowStart || windowEnd) ? {
        start: windowStart?.slice(0, 5),
        end: windowEnd?.slice(0, 5)
      } : undefined,
      start: startTime?.slice(0, 5),
      end: endTime?.slice(0, 5),
      location,
      attendees: attendees || []
    });
  } catch (err) {
    console.error('Failed to fetch event:', err);
    return json({ error: 'Failed to fetch event' }, { status: 500 });
  }
};

/**
 * PUT /api/calendar/[id] - Update event
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { id } = params;
  const data = await request.json();

  try {
    const updates: any = {};
    if (data.date !== undefined) updates.date = data.date;
    if (data.title !== undefined) updates.title = data.title;
    if (data.note !== undefined) updates.note = data.note;
    // if (updates.length > 0) updates.updated_at = new Date().toISOString(); // Schema doesn't specify updated_at on calendar_events? Original migration didn't.
    // Assuming no updated_at column on calendar_events based on migration 005_calendar.sql.

    if (Object.keys(updates).length > 0) {
        const { error: eventError } = await locals.supabase
            .from('calendar_events')
            .update(updates)
            .eq('id', id);
        if (eventError) throw eventError;
    }

    // Update kind-specific data
    // Fetch kind if not in data
    let kind = data.kind;
    if (!kind) {
         const { data: event } = await locals.supabase.from('calendar_events').select('kind').eq('id', id).single();
         kind = event?.kind;
    }

    if (kind === 'loading') {
         const leUpdates: any = {};
         if (data.carrier !== undefined) leUpdates.carrier = data.carrier;
         if (data.window) {
             if (data.window.start !== undefined) leUpdates.window_start = data.window.start;
             if (data.window.end !== undefined) leUpdates.window_end = data.window.end;
         }

         if (Object.keys(leUpdates).length > 0) {
              await locals.supabase.from('loading_events').update(leUpdates).eq('id', id);
         }

         if (data.poList !== undefined) {
             await locals.supabase.from('loading_event_pos').delete().eq('loading_event_id', id);
             if (data.poList.length > 0) {
                 const { data: orders } = await locals.supabase
                    .from('draft_orders')
                    .select('id')
                    .in('po_number', data.poList);

                 if (orders && orders.length > 0) {
                     const posToInsert = orders.map(o => ({
                         loading_event_id: id,
                         draft_order_id: o.id
                     }));
                     await locals.supabase.from('loading_event_pos').insert(posToInsert);
                 }
             }
         }
    } else if (kind === 'meeting') {
         const meUpdates: any = {};
         if (data.start !== undefined) meUpdates.start_time = data.start;
         if (data.end !== undefined) meUpdates.end_time = data.end;
         if (data.location !== undefined) meUpdates.location = data.location;
         if (data.attendees !== undefined) meUpdates.attendees = data.attendees;

         if (Object.keys(meUpdates).length > 0) {
              await locals.supabase.from('meeting_events').update(meUpdates).eq('id', id);
         }
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to update event:', err);
    return json({ error: 'Failed to update event' }, { status: 500 });
  }
};

/**
 * DELETE /api/calendar/[id] - Delete event
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { id } = params;

  try {
    const { error } = await locals.supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

    if (error) {
         throw error;
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to delete event:', err);
    return json({ error: 'Failed to delete event' }, { status: 500 });
  }
};
