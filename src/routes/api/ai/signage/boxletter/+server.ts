// POST /api/ai/signage/boxletter — backlit channel/box letter plan.

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';
import { planBoxLetter } from '$lib/server/ai/tools-registry/signage';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.supabase || !locals.user) throw svelteError(401, 'Unauthorized');
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'json body required' }, { status: 400 });
    try {
        return json(planBoxLetter(body));
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 400 });
    }
};
