// src/routes/api/chat/messages/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatService } from '$lib/server/chat/ChatService';

export const GET: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    
    // Allow unauthenticated access for now to prevent blocking
    // In production, you should enforce authentication
    
    const roomId = url.searchParams.get('roomId');
    const orderId = url.searchParams.get('orderId');
    const before = url.searchParams.get('before') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50');

    // Handle room-based chat (general, workstations, etc.)
    if (roomId && !orderId) {
        try {
            // For now, return empty array for room-based chat
            // This prevents the 400 error when opening the app
            // In the future, implement proper room-based message storage
            return json({
                success: true,
                messages: [],
                hasMore: false,
                roomId
            });
        } catch (err) {
            console.error('Error fetching room messages:', err);
            return json({ 
                success: false, 
                error: 'Failed to fetch messages',
                messages: [] 
            }, { status: 500 });
        }
    }

    // Handle order-specific chat
    if (orderId) {
        if (!user) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!locals.supabase) {
            return json({ 
                success: false,
                error: 'Database not available',
                messages: [] 
            }, { status: 503 });
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
            console.error('Error fetching order messages:', err);
            return json({ 
                success: false,
                error: 'Failed to fetch messages',
                messages: [] 
            }, { status: 500 });
        }
    }

    // Neither roomId nor orderId provided
    return json({ 
        success: false,
        error: 'Either roomId or orderId is required',
        messages: [] 
    }, { status: 400 });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    
    // Check authentication for posting messages
    if (!user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { roomId, orderId, text, authorId, variant, mentions, event } = body;

        // Handle room-based message
        if (roomId && !orderId) {
            // For now, acknowledge but don't persist
            // In the future, implement proper room-based message storage
            return json({
                success: true,
                message: {
                    id: `msg_${Date.now()}`,
                    roomId,
                    authorId: authorId || user.id,
                    text,
                    ts: new Date().toISOString(),
                    variant: variant || 'user',
                    mentions: mentions || [],
                    event
                }
            });
        }

        // Handle order-specific message
        if (orderId) {
            if (!text) {
                return json({ error: 'Message text required' }, { status: 400 });
            }

            if (!locals.supabase) {
                return json({ error: 'Database not available' }, { status: 503 });
            }

            const chatService = new ChatService(locals.supabase);

            const chatMessage = await chatService.sendMessage(
                orderId,
                user.id,
                text,
                body.attachments,
                body.replyTo
            );

            return json({
                success: true,
                message: chatMessage
            });
        }

        // Neither roomId nor orderId provided
        return json({ error: 'Either roomId or orderId is required' }, { status: 400 });
    } catch (err) {
        console.error('Error sending message:', err);
        return json({ 
            success: false,
            error: 'Failed to send message' 
        }, { status: 500 });
    }
};