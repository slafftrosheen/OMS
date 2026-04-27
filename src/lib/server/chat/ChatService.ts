// src/lib/server/chat/ChatService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logging/logger';

interface ChatMessage {
    id: string;
    orderId: string;
    userId: string;
    username: string;
    message: string;
    attachments?: string[];
    replyTo?: string;
    timestamp: Date;
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
                message: message.trim(),
                attachments,
                reply_to: replyTo,
                edited: false,
                deleted: false
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to send chat message', error);
            throw new Error('Could not send message');
        }

        // Update order's last activity
        await this.supabase
            .from('orders')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', orderId);

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
            message: chatMessage.message,
            attachments: chatMessage.attachments,
            replyTo: chatMessage.reply_to,
            timestamp: new Date(chatMessage.created_at),
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

        const { error } = await this.supabase
            .from('chat_messages')
            .update({ 
                message: newMessage.trim(),
                edited: true,
                edited_at: new Date().toISOString()
            })
            .eq('id', messageId);

        if (error) {
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
            .select('roles')
            .eq('id', userId)
            .single();

        const isAdmin = profile?.roles?.Admin;
        const isOwner = message.user_id === userId;

        if (!isAdmin && !isOwner) {
            throw new Error('Unauthorized to delete this message');
        }

        const { error } = await this.supabase
            .from('chat_messages')
            .update({ 
                deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by: userId
            })
            .eq('id', messageId);

        if (error) {
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
        
        let query = this.supabase
            .from('chat_messages')
            .select(`
                id,
                order_id,
                user_id,
                message,
                attachments,
                reply_to,
                created_at,
                edited,
                deleted,
                profiles!inner(username, avatar_url)
            `)
            .eq('order_id', orderId)
            .eq('deleted', false)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (before) {
            query = query.lt('created_at', before);
        }

        const { data, error } = await query;

        if (error || !data) {
            logger.error('Failed to fetch chat messages', error);
            return [];
        }

        return data.map(m => ({
            id: m.id,
            orderId: m.order_id,
            userId: m.user_id,
            username: (m.profiles as { username?: string; avatar_url?: string }[] | null)?.[0]?.username,
            message: m.message,
            attachments: m.attachments,
            replyTo: m.reply_to,
            timestamp: new Date(m.created_at),
            edited: m.edited,
            deleted: m.deleted
        })).reverse(); // Return in chronological order
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
                message,
                attachments,
                reply_to,
                created_at,
                edited,
                deleted,
                profiles!inner(username)
            `)
            .ilike('message', `%${query}%`)
            .eq('deleted', false)
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

        return data.map(m => ({
            id: m.id,
            orderId: m.order_id,
            userId: m.user_id,
            username: (m.profiles as { username?: string; avatar_url?: string }[] | null)?.[0]?.username,
            message: m.message,
            attachments: m.attachments,
            replyTo: m.reply_to,
            timestamp: new Date(m.created_at),
            edited: m.edited,
            deleted: m.deleted
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
            .from('orders')
            .select('created_by, assigned_to')
            .eq('id', orderId)
            .single();

        if (!order) return;

        const participants = new Set([order.created_by]);
        if (order.assigned_to) {
            order.assigned_to.forEach((id: string) => participants.add(id));
        }
        participants.delete(senderId); // Don't notify sender

        // Get sender name
        const { data: sender } = await this.supabase
            .from('profiles')
            .select('username')
            .eq('id', senderId)
            .single();

        // Create notifications
        const notifications = Array.from(participants).map(userId => ({
            user_id: userId,
            title: 'New Message',
            message: `${sender?.username || 'Someone'} sent a message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
            type: 'info' as const,
            action_url: `/orders/${orderId}?tab=chat`,
            read: false
        }));

        if (notifications.length > 0) {
            await this.supabase.from('notifications').insert(notifications);
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