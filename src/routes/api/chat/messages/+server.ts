// src/routes/api/chat/messages/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChatService } from '$lib/server/chat/ChatService';

/**
 * GET /api/chat/messages - Get messages for a room or order
 * Supports both roomId (general chat) and orderId (order-specific chat)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
    const roomId = url.searchParams.get('roomId');
    const orderId = url.searchParams.get('orderId');
    const before = url.searchParams.get('before') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '100');

    // Handle room-based chat (general, workstations, logistics)
    if (roomId && !orderId) {
        try {
            // Ensure database connection
            if (!locals.supabase) {
                console.error('Supabase client not available');
                return json({ 
                    success: true, 
                    messages: [], 
                    hasMore: false,
                    error: 'Database not available'
                });
            }

            // Fetch messages from chat_messages table
            let query = locals.supabase
                .from('chat_messages')
                .select(`
                    id,
                    room_id,
                    user_id,
                    content,
                    attachments,
                    created_at,
                    profiles:user_id (
                        id,
                        display_name,
                        username,
                        avatar_url
                    )
                `)
                .eq('room_id', roomId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (before) {
                query = query.lt('created_at', before);
            }

            const { data: messages, error } = await query;

            if (error) {
                console.error('Error fetching room messages:', error);
                return json({ 
                    success: true,
                    messages: [],
                    hasMore: false,
                    error: error.message
                });
            }

            // Transform to expected format
            const transformedMessages = (messages || []).map(msg => ({
                id: msg.id,
                roomId: msg.room_id,
                authorId: msg.user_id || 'system',
                text: msg.content,
                ts: msg.created_at,
                mentions: [],
                variant: msg.user_id ? 'user' : 'system',
                author: msg.profiles ? {
                    id: msg.profiles.id,
                    displayName: msg.profiles.display_name,
                    username: msg.profiles.username,
                    avatarUrl: msg.profiles.avatar_url
                } : null
            }));

            // Reverse to get chronological order
            transformedMessages.reverse();

            return json({
                success: true,
                messages: transformedMessages,
                hasMore: messages ? messages.length === limit : false
            });
        } catch (err) {
            console.error('Unexpected error fetching room messages:', err);
            return json({ 
                success: true,
                messages: [],
                hasMore: false
            });
        }
    }

    // Handle order-specific chat
    if (orderId) {
        // Require authentication for order chat
        if (!locals.user) {
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

/**
 * POST /api/chat/messages - Send a message to a room or order
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const body = await request.json();
        const { roomId, orderId, text, authorId, variant, mentions, event } = body;

        if (!text || text.trim().length === 0) {
            return json({ error: 'Message text required' }, { status: 400 });
        }

        // Handle room-based message
        if (roomId && !orderId) {
            if (!locals.supabase) {
                return json({ error: 'Database not available' }, { status: 503 });
            }

            // Insert message into database
            const { data: message, error } = await locals.supabase
                .from('chat_messages')
                .insert({
                    room_id: roomId,
                    user_id: locals.user?.id || null,
                    content: text.trim(),
                    attachments: []
                })
                .select(`
                    id,
                    room_id,
                    user_id,
                    content,
                    created_at,
                    profiles:user_id (
                        id,
                        display_name,
                        username,
                        avatar_url
                    )
                `)
                .single();

            if (error) {
                console.error('Error saving room message:', error);
                return json({ error: 'Failed to save message' }, { status: 500 });
            }

            // Return message in expected format
            return json({
                success: true,
                message: {
                    id: message.id,
                    roomId: message.room_id,
                    authorId: message.user_id || 'system',
                    text: message.content,
                    ts: message.created_at,
                    mentions: mentions || [],
                    variant: message.user_id ? 'user' : 'system',
                    author: message.profiles ? {
                        id: message.profiles.id,
                        displayName: message.profiles.display_name,
                        username: message.profiles.username,
                        avatarUrl: message.profiles.avatar_url
                    } : null
                }
            });
        }

        // Handle order-specific message
        if (orderId) {
            if (!locals.user) {
                return json({ error: 'Unauthorized' }, { status: 401 });
            }

            if (!locals.supabase) {
                return json({ error: 'Database not available' }, { status: 503 });
            }

            const chatService = new ChatService(locals.supabase);

            const chatMessage = await chatService.sendMessage(
                orderId,
                locals.user.id,
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