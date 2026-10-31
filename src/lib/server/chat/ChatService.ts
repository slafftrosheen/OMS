// src/lib/server/chat/ChatService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logging/logger';
import { publishNotifications } from '../notifications/publish';
import type { Attachment } from '$lib/chat/types';
import { messageVoices } from './voice-service';
import { chatCursorFilter, chatPage, type ChatCursor } from './history';

interface ChatMessage {
    id: string;
    orderId: string;
    userId: string;
    username: string;
    message: string;
    attachments?: string[];
    voiceAttachments?: Attachment[];
    replyTo?: string;
    timestamp: Date | string;
    edited?: boolean;
    deleted?: boolean;
}

interface ChatThread {
    orderId: string;
    participants: string[];
    lastMessage?: ChatMessage;
    unreadCount: number;
}

export class ChatService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Send a message to an order chat
     */
    async sendMessage(
        orderId: string,
        userId: string,
        message: string,
        attachments?: string[],
        replyTo?: string
    ): Promise<ChatMessage> {
        
        // Validate message
        if (!message.trim() && (!attachments || attachments.length === 0)) {
            throw new Error('Message cannot be empty');
        }

        // Get user info
        const { data: user, error: userError } = await this.supabase
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            throw new Error('User not found');
        }

        // Insert message
        const { data: chatMessage, error } = await this.supabase
            .from('chat_messages')
            .insert({
                order_id: orderId,
                user_id: userId,
                text: message.trim(),
                content: message.trim(),
                attachments: attachments ?? [],
                reply_to_id: replyTo ?? null,
                is_edited: false,
                is_deleted: false
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to send chat message', error);
            throw new Error('Could not send message');
        }

        // Send notifications to order participants (except sender)
        await this.notifyParticipants(orderId, userId, message);

        logger.info('Chat message sent', { 
            messageId: chatMessage.id, 
            orderId, 
            userId 
        });

        return {
            id: chatMessage.id,
            orderId,
            userId,
            username: user.username,
            message: chatMessage.content ?? chatMessage.text,
            attachments: chatMessage.attachments,
            replyTo: chatMessage.reply_to_id,
            timestamp: chatMessage.created_at,
            edited: false,
            deleted: false
        };
    }

    /**
     * Edit an existing message
     */
    async editMessage(
        messageId: string,
        userId: string,
        newMessage: string
    ): Promise<void> {
        
        if (!newMessage.trim()) throw new Error('Message cannot be empty');

        // Verify ownership
        const { data: message, error: fetchError } = await this.supabase
            .from('chat_messages')
            .select('user_id, created_at')
            .eq('id', messageId)
            .single();

        if (fetchError || !message) {
            throw new Error('Message not found');
        }

        if (message.user_id !== userId) {
            throw new Error('Unauthorized to edit this message');
        }

        // Only allow editing within 15 minutes
        const messageAge = Date.now() - new Date(message.created_at).getTime();
        if (messageAge > 15 * 60 * 1000) {
            throw new Error('Message too old to edit (15 minute limit)');
        }

        const { data: changed, error } = await this.supabase
            .from('chat_messages')
            .update({ 
                text: newMessage.trim(),
                content: newMessage.trim(),
                is_edited: true
            })
            .eq('id', messageId).select('id').single();

        if (error || !changed) {
            throw new Error('Failed to edit message');
        }

        logger.info('Chat message edited', { messageId, userId });
    }

    /**
     * Delete a message (soft delete)
     */
    async deleteMessage(messageId: string, userId: string): Promise<void> {
        
        // Verify ownership or admin
        const { data: message } = await this.supabase
            .from('chat_messages')
            .select('user_id')
            .eq('id', messageId)
            .single();

        if (!message) {
            throw new Error('Message not found');
        }

        const { data: profile } = await this.supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        const isAdmin = ['RD', 'Boss', 'HeadOfProduction'].includes(profile?.role);
        const isOwner = message.user_id === userId;

        if (!isAdmin && !isOwner) {
            throw new Error('Unauthorized to delete this message');
        }

        const { data: changed, error } = await this.supabase
            .from('chat_messages')
            .update({ 
                is_deleted: true
            })
            .eq('id', messageId).select('id').single();

        if (error || !changed) {
            throw new Error('Failed to delete message');
        }

        logger.info('Chat message deleted', { messageId, userId });
    }

    /**
     * Get chat messages for an order
     */
    async getMessages(
        orderId: string,
        limit: number = 50,
        before?: string
    ): Promise<ChatMessage[]> {
        return (await this.getMessagePage(orderId, limit, before)).messages;
    }

    async getMessagePage(orderId: string, limit = 50, before?: string, cursor?: ChatCursor): Promise<{ messages: ChatMessage[]; hasMore: boolean; nextCursor: string | null }> {
        limit = Math.max(1, Math.min(100, Math.trunc(limit) || 50));
        let query = this.supabase
            .from('chat_messages')
            .select(`
                id,
                order_id,
                user_id,
                content,
                text,
                attachments,
                reply_to_id,
                created_at,
                is_edited,
                is_deleted,
                profiles!inner(username, avatar_url)
            `)
            .eq('order_id', orderId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(limit + 1);

        if (cursor) query = query.or(chatCursorFilter(cursor));
        else if (before) {
            query = query.lt('created_at', before);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('Failed to fetch chat messages', error);
            throw new Error('Could not fetch messages');
        }

        const page = chatPage(data ?? [], limit);
        const voices = await messageVoices(this.supabase, page.rows.map(m => m.id));
        const messages = page.rows.map(m => ({
            id: m.id,
            orderId: m.order_id,
            userId: m.user_id,
            username: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.username ?? '',
            message: m.content ?? m.text,
            attachments: Array.isArray(m.attachments) ? m.attachments.filter(item => typeof item === 'string') : [],
            voiceAttachments: voices.get(m.id) || [],
            replyTo: m.reply_to_id,
            timestamp: m.created_at,
            edited: m.is_edited,
            deleted: m.is_deleted
        })).reverse(); // Return in chronological order
        return { messages, hasMore: page.hasMore, nextCursor: page.nextCursor };
    }

    /**
     * Get unread message count for user
     */
    async getUnreadCount(userId: string): Promise<Record<string, number>> {
        
        // Get all orders user is involved with
        const { data: orders } = await this.supabase
            .from('orders')
            .select('id')
            .or(`created_by.eq.${userId},assigned_to.cs.{${userId}}`);

        if (!orders) return {};

        const unreadCounts: Record<string, number> = {};

        for (const order of orders) {
            // Get last read timestamp for this order
            const { data: readStatus } = await this.supabase
                .from('chat_read_status')
                .select('last_read_at')
                .eq('order_id', order.id)
                .eq('user_id', userId)
                .single();

            const lastRead = readStatus?.last_read_at || new Date(0).toISOString();

            // Count unread messages
            const { count } = await this.supabase
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('order_id', order.id)
                .gt('created_at', lastRead)
                .neq('user_id', userId);

            if (count && count > 0) {
                unreadCounts[order.id] = count;
            }
        }

        return unreadCounts;
    }

    /**
     * Mark messages as read
     */
    async markAsRead(orderId: string, userId: string): Promise<void> {
        
        await this.supabase
            .from('chat_read_status')
            .upsert({
                order_id: orderId,
                user_id: userId,
                last_read_at: new Date().toISOString()
            }, {
                onConflict: 'order_id,user_id'
            });
    }

    /**
     * Search messages
     */
    async searchMessages(
        query: string,
        orderId?: string,
        userId?: string
    ): Promise<ChatMessage[]> {
        
        let dbQuery = this.supabase
            .from('chat_messages')
            .select(`
                id,
                order_id,
                user_id,
                content,
                text,
                attachments,
                reply_to_id,
                created_at,
                is_edited,
                is_deleted,
                profiles!inner(username)
            `)
            .ilike('content', `%${query}%`)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(100);

        if (orderId) {
            dbQuery = dbQuery.eq('order_id', orderId);
        }

        if (userId) {
            dbQuery = dbQuery.eq('user_id', userId);
        }

        const { data, error } = await dbQuery;

        if (error || !data) {
            return [];
        }

        return (data ?? []).map(m => ({
            id: m.id,
            orderId: m.order_id,
            userId: m.user_id,
            username: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.username ?? '',
            message: m.content ?? m.text,
            attachments: m.attachments,
            replyTo: m.reply_to_id,
            timestamp: new Date(m.created_at),
            edited: m.is_edited,
            deleted: m.is_deleted
        }));
    }

    /**
     * Notify participants about new message
     */
    private async notifyParticipants(
        orderId: string,
        senderId: string,
        message: string
    ): Promise<void> {
        
        // Get order participants
        const { data: order } = await this.supabase
            .from('draft_orders')
            .select('created_by')
            .eq('id', orderId)
            .single();

        if (!order) return;

        const participants = new Set([order.created_by]);
        const { data: assignees } = await this.supabase.from('order_assignees')
            .select('assignee_id').eq('draft_order_id', orderId);
        for (const assignment of assignees ?? []) participants.add(assignment.assignee_id);
        participants.delete(senderId); // Don't notify sender

        // Get sender name
        const { data: sender } = await this.supabase
            .from('profiles')
            .select('username')
            .eq('id', senderId)
            .single();

        // Create notifications
        const notifications = Array.from(participants).filter((userId): userId is string => typeof userId === 'string' && !!userId).map(userId => ({
            user_id: userId,
            title: 'New Message',
            message: `${sender?.username || 'Someone'} sent a message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
            notification_type: 'chat_message',
            link: `/orders/${orderId}?tab=chat`,
            source_type: 'chat',
            source_id: orderId
        }));

        if (notifications.length > 0) {
            await publishNotifications(this.supabase, notifications);
        }
    }

    /**
     * Get typing indicator status
     */
    async setTyping(orderId: string, userId: string, isTyping: boolean): Promise<void> {
        
        if (isTyping) {
            await this.supabase
                .from('chat_typing_indicators')
                .upsert({
                    order_id: orderId,
                    user_id: userId,
                    last_typing_at: new Date().toISOString()
                }, {
                    onConflict: 'order_id,user_id'
                });
        } else {
            await this.supabase
                .from('chat_typing_indicators')
                .delete()
                .eq('order_id', orderId)
                .eq('user_id', userId);
        }
    }

    /**
     * Get users currently typing
     */
    async getTypingUsers(orderId: string): Promise<string[]> {
        
        const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();

        const { data } = await this.supabase
            .from('chat_typing_indicators')
            .select('user_id, profiles!inner(username)')
            .eq('order_id', orderId)
            .gt('last_typing_at', thirtySecondsAgo);

        return data?.map((t) => {
            const p = (t as { profiles?: { username?: string }[] | { username?: string } }).profiles;
            return Array.isArray(p) ? p[0]?.username : p?.username;
        }).filter(Boolean) as string[] || [];
    }
}
