/**
 * Station-room messenger.
 * Phase 10: post a system message to the per-station chat room (e.g.
 * "station-cnc") whenever an order's stage changes, so operators see new
 * arrivals / completions in the unified chat sidebar in real time.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const STAGE_TO_ROOM: Record<string, string> = {
    CAD: 'station-cad',
    CNC: 'station-cnc',
    EDGE: 'station-edge',
    ASSEMBLY: 'station-assembly',
    PAINT: 'station-paint',
    PACKAGING: 'station-packaging',
    DELIVERY: 'station-delivery',
};

export function stationRoomFor(station: string): string | null {
    return STAGE_TO_ROOM[station.toUpperCase()] ?? null;
}

export interface StationMessage {
    station: string;        // e.g. "CNC"
    poNumber?: string;      // human-friendly order ref
    state: string;          // e.g. "QUEUED" | "IN_PROGRESS" | "COMPLETED"
    actorName?: string;     // who triggered the transition
}

/**
 * Post a single system message into a station's chat room. Failures are
 * logged but never thrown — chat is non-essential to the production flow.
 */
export async function postStationMessage(
    supabase: SupabaseClient,
    msg: StationMessage,
): Promise<void> {
    const roomId = stationRoomFor(msg.station);
    if (!roomId) return;

    const verb =
        msg.state === 'QUEUED'      ? 'queued for'
      : msg.state === 'IN_PROGRESS' ? 'started at'
      : msg.state === 'COMPLETED'   ? 'completed at'
      : msg.state === 'BLOCKED'     ? 'blocked at'
      : msg.state === 'REWORK'      ? 'sent back for rework at'
      : `→ ${msg.state} at`;

    const orderRef = msg.poNumber ? `Order ${msg.poNumber}` : 'An order';
    const actor = msg.actorName ? ` (${msg.actorName})` : '';
    const body = `${orderRef} ${verb} ${msg.station}${actor}`;

    try {
        await supabase.from('chat_messages').insert({
            room_id: roomId,
            user_id: null,
            content: body,
            text: body,
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[stationMessenger] insert failed:', err);
    }
}
