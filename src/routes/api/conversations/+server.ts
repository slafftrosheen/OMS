/**
 * GET  /api/conversations            list the calling user's conversations
 * POST /api/conversations            create a new conversation (optional title/agent)
 *
 * Conversation persistence backs the chat UI so refreshes don't wipe history.
 * Phase 4 ships the storage + endpoints; Phase 5+ will wire the UI to them.
 */

import { error as svelteError, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { created, okList, requireAuth, validate } from '$lib/server/api/helpers';

const CreateConversationSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    agent: z.enum(['router', 'reasoning', 'engineer', 'vision']).optional()
});

export const GET: RequestHandler = async ({ locals, url }) => {
    const user = requireAuth(locals);

    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);

    const { data, error: dbError, count } = await locals.supabase
        .from('conversations')
        .select('id, title, agent, metadata, created_at, updated_at', { count: 'exact' })
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (dbError) {
        console.error('[/api/conversations] list failed:', dbError);
        throw svelteError(500, 'Failed to load conversations');
    }

    return okList(data ?? [], { total: count ?? (data?.length ?? 0), limit, page: Math.floor(offset / limit) + 1 });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = requireAuth(locals);
    const input = validate(CreateConversationSchema, await request.json().catch(() => ({})));

    const { data, error: dbError } = await locals.supabase
        .from('conversations')
        .insert({
            user_id: user.id,
            title: input.title ?? null,
            agent: input.agent ?? null
        })
        .select()
        .single();

    if (dbError) {
        console.error('[/api/conversations] create failed:', dbError);
        throw svelteError(500, 'Failed to create conversation');
    }

    return created(data);
};
