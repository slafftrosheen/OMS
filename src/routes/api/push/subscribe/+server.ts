/**
 * POST /api/push/subscribe
 *
 * Receives a Web Push PushSubscription JSON object from the browser and
 * upserts it onto public.push_subscriptions, scoped to the authed user.
 *
 * The browser sends a body shaped like:
 *   { endpoint: "...", keys: { p256dh: "...", auth: "..." } }
 * which is the result of `navigator.serviceWorker.ready.then(r =>
 * r.pushManager.subscribe(...))`.
 */

import { error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { okOne, requireAuth, validate } from '$lib/server/api/helpers';

const PushSubscriptionSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1)
    })
});

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = requireAuth(locals);
    const body = await request.json().catch(() => null);
    const sub = validate(PushSubscriptionSchema, body);

    const userAgent = request.headers.get('user-agent') ?? null;

    const { data, error: dbError } = await locals.supabase
        .from('push_subscriptions')
        .upsert(
            {
                user_id: user.id,
                endpoint: sub.endpoint,
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
                user_agent: userAgent,
                last_seen_at: new Date().toISOString()
            },
            { onConflict: 'user_id,endpoint' }
        )
        .select()
        .single();

    if (dbError) {
        console.error('[push.subscribe] Failed to store subscription:', dbError);
        throw error(500, 'Failed to store subscription');
    }

    return okOne(data);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
    const user = requireAuth(locals);
    const body = await request.json().catch(() => ({}));
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;

    if (!endpoint) {
        throw error(400, 'Missing `endpoint` in body');
    }

    const { error: dbError } = await locals.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', endpoint);

    if (dbError) {
        console.error('[push.subscribe] Failed to delete subscription:', dbError);
        throw error(500, 'Failed to delete subscription');
    }

    return new Response(null, { status: 204 });
};
