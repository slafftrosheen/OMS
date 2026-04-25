/**
 * GET    /api/conversations/[id]            fetch a conversation + its messages
 * PATCH  /api/conversations/[id]            rename / re-tag the conversation
 * DELETE /api/conversations/[id]            delete a conversation (cascade)
 * POST   /api/conversations/[id]/messages   (in messages/+server.ts)
 */

import { error as svelteError, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { okOne, requireAuth, validate } from '$lib/server/api/helpers';

const UpdateConversationSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    agent: z.enum(['router', 'reasoning', 'engineer', 'vision']).optional(),
    metadata: z.record(z.any()).optional()
});

async function ensureOwned(locals: App.Locals, id: string) {
    const user = requireAuth(locals);
    const { data, error: dbError } = await locals.supabase
        .from('conversations')
        .select('id, user_id, title, agent, metadata, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();
    if (dbError) throw svelteError(500, 'Failed to load conversation');
    if (!data) throw svelteError(404, 'Conversation not found');
    if (data.user_id !== user.id) throw svelteError(403, 'Forbidden');
    return { user, conversation: data };
}

export const GET: RequestHandler = async ({ params, locals }) => {
    const { conversation } = await ensureOwned(locals, params.id as string);

    const { data: messages, error: dbError } = await locals.supabase
        .from('conversation_messages')
        .select('id, role, content, images, metadata, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

    if (dbError) {
        console.error('[/api/conversations/:id] messages load failed:', dbError);
        throw svelteError(500, 'Failed to load messages');
    }

    return okOne({ ...conversation, messages: messages ?? [] });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    const { conversation } = await ensureOwned(locals, params.id as string);
    const input = validate(UpdateConversationSchema, await request.json().catch(() => ({})));

    const { data, error: dbError } = await locals.supabase
        .from('conversations')
        .update(input)
        .eq('id', conversation.id)
        .select()
        .single();

    if (dbError) {
        console.error('[/api/conversations/:id] update failed:', dbError);
        throw svelteError(500, 'Failed to update conversation');
    }

    return okOne(data);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const { conversation } = await ensureOwned(locals, params.id as string);
    const { error: dbError } = await locals.supabase
        .from('conversations')
        .delete()
        .eq('id', conversation.id);
    if (dbError) {
        console.error('[/api/conversations/:id] delete failed:', dbError);
        throw svelteError(500, 'Failed to delete conversation');
    }
    return new Response(null, { status: 204 });
};
