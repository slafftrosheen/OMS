/**
 * POST /api/conversations/[id]/messages
 *
 * Append a message to a conversation owned by the calling user.
 *
 * Used by the chat UI to persist both the user's prompt and the assistant's
 * reply once Phase 5 wires the UI to /api/conversations.
 */

import { error as svelteError, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { created, requireAuth, validate } from '$lib/server/api/helpers';

const AppendMessageSchema = z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string().min(1).max(50_000),
    images: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional()
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const user = requireAuth(locals);
    const conversationId = params.id as string;

    // Confirm ownership before writing.
    const { data: convo, error: cErr } = await locals.supabase
        .from('conversations')
        .select('id, user_id')
        .eq('id', conversationId)
        .maybeSingle();
    if (cErr) throw svelteError(500, 'Failed to verify conversation');
    if (!convo) throw svelteError(404, 'Conversation not found');
    if (convo.user_id !== user.id) throw svelteError(403, 'Forbidden');

    const input = validate(AppendMessageSchema, await request.json().catch(() => null));

    const { data, error: dbError } = await locals.supabase
        .from('conversation_messages')
        .insert({
            conversation_id: conversationId,
            role: input.role,
            content: input.content,
            images: input.images ?? null,
            metadata: input.metadata ?? {}
        })
        .select()
        .single();

    if (dbError) {
        console.error('[/api/conversations/:id/messages] append failed:', dbError);
        throw svelteError(500, 'Failed to append message');
    }

    return created(data);
};
