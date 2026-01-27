// src/routes/api/chat/messages/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatService } from '$lib/server/chat/ChatService';

export const GET: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const orderId = url.searchParams.get('orderId');
    const before = url.searchParams.get('before') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!orderId) {
        throw svelteError(400, 'Order ID required');
    }

    const chatService = new ChatService(locals.supabase);

    try {
        const messages = await chatService.getMessages(orderId, limit, before);

        return json({
            success: true,
            messages,
            hasMore: messages.length === limit
        });
    } catch (err) {
        throw svelteError(500, 'Failed to fetch messages');
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const { orderId, message, attachments, replyTo } = await request.json();

    if (!orderId || !message) {
        throw svelteError(400, 'Order ID and message required');
    }

    const chatService = new ChatService(locals.supabase);

    try {
        const chatMessage = await chatService.sendMessage(
            orderId,
            user.id,
            message,
            attachments,
            replyTo
        );

        return json({
            success: true,
            message: chatMessage
        });
    } catch (err) {
        throw svelteError(500, 'Failed to send message');
    }
};