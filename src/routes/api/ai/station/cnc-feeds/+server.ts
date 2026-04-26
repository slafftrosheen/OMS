// POST /api/ai/station/cnc-feeds — feeds & speeds suggestion.
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
    suggestFeedsSpeeds,
    type FeedsSpeedsArgs
} from '$lib/server/ai/tools-registry/cnc-feeds';

export const POST: RequestHandler = async ({ request }) => {
    const body = (await request.json().catch(() => null)) as FeedsSpeedsArgs | null;
    if (!body?.material || !body.tool_diameter_mm || !body.operation) {
        return json({ error: 'material, tool_diameter_mm, operation required' }, { status: 400 });
    }
    try {
        return json(await suggestFeedsSpeeds(body));
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 500 });
    }
};
