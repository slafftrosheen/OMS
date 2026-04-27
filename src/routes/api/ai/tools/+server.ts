// GET /api/ai/tools — list active AI tools (UI registry).
// Optional ?role=&station=&category= filters.

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { listTools } from '$lib/server/ai/tools-registry';

export const GET: RequestHandler = async ({ url }) => {
    const role = url.searchParams.get('role') ?? undefined;
    const station = url.searchParams.get('station') ?? undefined;
    const category = url.searchParams.get('category') ?? undefined;
    const tools = await listTools({ role, station, category });
    return json({ tools });
};
