import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postStationMessage } from '$lib/server/chat/stationMessenger';

import { ORDER_STAGE_STATES } from '$lib/order/stage-contract';

const VALID_STATES = ORDER_STAGE_STATES;
const WORKFLOW_ORDER = ['CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'] as const;

/**
 * GET /api/orders/[id]/stages — list every workflow-stage row for an order.
 *
 * The on-disk column is `draft_order_id` (orders is a view of draft_orders);
 * the previous version of this handler used `order_id`, which silently
 * returned an empty list because PostgREST treats unknown filters as no-ops
 * but our select() returned nothing matching anyway. Fixed.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    const { supabase } = locals;

    try {
        const { data, error: queryError } = await supabase
            .from('order_stages')
            .select('*')
            .eq('draft_order_id', params.id)
            .order('station');

        if (queryError) throw error(500, queryError.message);

        return json(data || []);
    } catch (err: any) {
        if (err.status) throw err;
        throw error(500, 'Internal server error');
    }
};

/**
 * PATCH /api/orders/[id]/stages?station=CNC — update a single stage row.
 *
 * Side-effects (Phase 10):
 *   - Posts a system message to the matching station room (e.g. station-cnc)
 *     whenever state transitions. Operators see arrivals / completions in
 *     the chat sidebar in real time.
 *   - When a stage is COMPLETED, auto-queues the next workflow stage (the
 *     classic "send to next station" flow) and announces it as well.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    const { supabase } = locals;

    const station = url.searchParams.get('station');
    if (!station) throw error(400, 'Station parameter required');

    let body: any;
    try {
        body = await request.json();
    } catch {
        throw error(400, 'Invalid JSON body');
    }

    if (body.state && !VALID_STATES.includes(body.state)) {
        throw error(400, 'Invalid state');
    }

    const updateData: Record<string, unknown> = {};
    if (body.state) updateData.state = body.state;
    if (body.blocked_reason !== undefined) updateData.blocked_reason = body.blocked_reason;
    if (body.estimated_hours !== undefined) updateData.estimated_hours = body.estimated_hours;
    if (body.actual_hours !== undefined) updateData.actual_hours = body.actual_hours;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // Set started_at / completed_at automatically when state transitions
    if (body.state === 'IN_PROGRESS') updateData.started_at = new Date().toISOString();
    if (body.state === 'COMPLETED') updateData.completed_at = new Date().toISOString();

    try {
        const { data: updated, error: updateError } = await supabase
            .from('order_stages')
            .update(updateData)
            .eq('draft_order_id', params.id)
            .eq('station', station)
            .select('id, draft_order_id, station, state')
            .single();

        if (updateError) {
            console.error('Stage update error:', updateError);
            throw error(500, updateError.message);
        }

        // ── Side effects: chat room broadcast + auto-queue next stage ───────
        if (body.state) {
            const { data: orderRow } = await supabase
                .from('draft_orders')
                .select('po_number')
                .eq('id', params.id)
                .single();

            const { data: actor } = await supabase
                .from('profiles')
                .select('display_name, username')
                .eq('id', session.user.id)
                .single();

            await postStationMessage(supabase, {
                station,
                poNumber: orderRow?.po_number,
                state: body.state,
                actorName: actor?.display_name || actor?.username,
            });

            // If we just completed this stage, queue the next one (and
            // announce that too).
            if (body.state === 'COMPLETED') {
                const idx = WORKFLOW_ORDER.indexOf(station as any);
                const next = idx >= 0 && idx + 1 < WORKFLOW_ORDER.length
                    ? WORKFLOW_ORDER[idx + 1]
                    : null;
                if (next) {
                    await supabase
                        .from('order_stages')
                        .update({ state: 'QUEUED' })
                        .eq('draft_order_id', params.id)
                        .eq('station', next)
                        .eq('state', 'NOT_STARTED');

                    await postStationMessage(supabase, {
                        station: next,
                        poNumber: orderRow?.po_number,
                        state: 'QUEUED',
                        actorName: actor?.display_name || actor?.username,
                    });
                }
            }
        }

        return json(updated);
    } catch (err: any) {
        if (err.status) throw err;
        console.error('Stage PATCH error:', err);
        throw error(500, 'Internal server error');
    }
};
