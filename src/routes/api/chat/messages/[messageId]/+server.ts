// src/routes/api/chat/messages/[messageId]/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatService } from '$lib/server/chat/ChatService';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const { message } = await request.json();

    if (!message) {
        throw svelteError(400, 'Message content required');
    }

    const chatService = new ChatService(locals.supabase);

    try {
        await chatService.editMessage(params.messageId, user.id, message);

        return json({ success: true });
    } catch (err) {
        const error = err as Error;
        throw svelteError(400, error.message);
    }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const chatService = new ChatService(locals.supabase);

    try {
        await chatService.deleteMessage(params.messageId, user.id);

        return json({ success: true });
    } catch (err) {
        const error = err as Error;
        throw svelteError(400, error.message);
    }
};