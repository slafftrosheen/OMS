// GET /api/ai/tools — server-filtered tool capabilities for the signed-in user.
// Never accept a client-supplied role: callers cannot impersonate management.
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { listTools } from '$lib/server/ai/tools-registry';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const station = url.searchParams.get('station') ?? undefined;
    const category = url.searchParams.get('category') ?? undefined;
    const assigned = (locals.user.stations ?? []).map(s => s.stationId?.toUpperCase());
    const isManager = ['RD', 'Boss', 'HeadOfProduction'].includes(locals.user.role ?? '');
    if (station && !isManager && !assigned.includes(station.toUpperCase())) {
        throw error(403, 'Station assignment required');
    }
    const tools = await listTools({ role: locals.user.role, station: station?.toUpperCase(), category });
    return json({ tools }, { headers: { 'Cache-Control': 'private, no-store' } });
};
