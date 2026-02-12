// src/lib/notifications/NotificationService.ts
import { writable, get } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Notification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    read: boolean;
    action_url?: string;
    created_at: string;
}

class NotificationService {
    private supabase: SupabaseClient | null = null;
    private notifications = writable<Notification[]>([]);
    private unreadCount = writable<number>(0);
    private channel: any = null;

    initialize(supabase: SupabaseClient, userId: string) {
        this.supabase = supabase;

        // Load existing notifications
        this.loadNotifications(userId);

        // Subscribe to realtime updates for notifications
        this.channel = supabase
            .channel('notifications')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    this.handleRealtimeNotification(payload);
                }
            )
            .subscribe();
    }
    
    private handleRealtimeNotification(payload: any) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        if (eventType === 'INSERT') {
            // Check if we already have this notification
            const exists = get(this.notifications).some(n => n.id === newRecord.id);
            if (!exists) {
                this.notifications.update(n => [newRecord, ...n]);
                this.updateUnreadCount();
                this.showBrowserNotification(newRecord);
            }
        } else if (eventType === 'UPDATE') {
            this.notifications.update(n =>
                n.map(notif => notif.id === newRecord.id ? newRecord : notif)
            );
            this.updateUnreadCount();
        }
    }

    private async loadNotifications(userId: string) {
        if (!this.supabase) return;

        const { data, error } = await this.supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            this.notifications.set(data);
            this.updateUnreadCount();
        }
    }

    private updateUnreadCount() {
        const notifs = get(this.notifications);
        const count = notifs.filter(n => !n.read).length;
        this.unreadCount.set(count);
    }

    private async showBrowserNotification(notification: Notification) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.message,
                icon: '/favicon.png',
                tag: notification.id
            });
        }
    }

    async markAsRead(notificationId: string) {
        if (!this.supabase) return;

        await this.supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);

        this.notifications.update(n =>
            n.map(notif => notif.id === notificationId ? { ...notif, read: true } : notif)
        );
        this.updateUnreadCount();
    }

    async markAllAsRead() {
        if (!this.supabase) return;

        const notifs = get(this.notifications);
        const unreadIds = notifs.filter(n => !n.read).map(n => n.id);

        if (unreadIds.length > 0) {
            await this.supabase
                .from('notifications')
                .update({ read: true })
                .in('id', unreadIds);

            this.notifications.update(n => n.map(notif => ({ ...notif, read: true })));
            this.unreadCount.set(0);
        }
    }

    async requestPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    getNotifications() {
        return this.notifications;
    }

    getUnreadCount() {
        return this.unreadCount;
    }

    cleanup() {
        if (this.supabase && this.channel) {
            this.supabase.removeChannel(this.channel);
        }
    }
}

export const notificationService = new NotificationService();