import { writable, get } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Notification {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

// Simple one-shot beep generated via Web Audio API — no CDN dependency
function buildNotificationSound(): (() => void) | null {
  if (typeof window === 'undefined') return null;

  return () => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.3);
      o.onended = () => ctx.close();
    } catch {
      // Audio not available
    }
  };
}

class NotificationService {
  private supabase: SupabaseClient | null = null;
  private userId: string | null = null;
  private notifications = writable<Notification[]>([]);
  private unreadCount = writable<number>(0);
  private channel: any = null;
  private soundEnabled = true;
  private playSound = buildNotificationSound();

  initialize(supabase: SupabaseClient, userId: string, soundEnabled = true) {
    // Clean up previous subscription if re-initialising
    this.cleanup();

    this.supabase = supabase;
    this.userId = userId;
    this.soundEnabled = soundEnabled;

    this.loadNotifications(userId);

    // Per-user realtime — filter is enforced at the channel level AND by RLS
    this.channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => this.handleRealtimeNotification(payload)
      )
      .subscribe();
  }

  setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  private handleRealtimeNotification(payload: any) {
    const { eventType, new: newRecord } = payload;

    if (eventType === 'INSERT') {
      const exists = get(this.notifications).some(n => n.id === newRecord.id);
      if (!exists) {
        this.notifications.update(n => [newRecord, ...n]);
        this.updateUnreadCount();
        this.triggerSound();
        this.showBrowserNotification(newRecord);
      }
    } else if (eventType === 'UPDATE') {
      this.notifications.update(n =>
        n.map(notif => notif.id === newRecord.id ? { ...notif, ...newRecord } : notif)
      );
      this.updateUnreadCount();
    } else if (eventType === 'DELETE') {
      this.notifications.update(n => n.filter(notif => notif.id !== payload.old?.id));
      this.updateUnreadCount();
    }
  }

  private triggerSound() {
    if (this.soundEnabled && this.playSound) {
      this.playSound();
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
      this.notifications.set(data as Notification[]);
      this.updateUnreadCount();
    }
  }

  private updateUnreadCount() {
    const count = get(this.notifications).filter(n => !n.is_read).length;
    this.unreadCount.set(count);
  }

  private async showBrowserNotification(notification: Notification) {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    new window.Notification(notification.title, {
      body: notification.message ?? undefined,
      icon: '/icons/icon-192.png',
      tag: notification.id,
    });
  }

  async requestPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }
  }

  async markAsRead(notificationId: string) {
    if (!this.supabase) return;
    await this.supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);

    this.notifications.update(n =>
      n.map(notif => notif.id === notificationId ? { ...notif, is_read: true } : notif)
    );
    this.updateUnreadCount();
  }

  async markAllAsRead() {
    if (!this.supabase || !this.userId) return;
    await this.supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', this.userId)
      .eq('is_read', false);

    this.notifications.update(n => n.map(notif => ({ ...notif, is_read: true })));
    this.unreadCount.set(0);
  }

  async dismiss(notificationId: string) {
    if (!this.supabase) return;
    await this.supabase
      .from('notifications')
      .update({ is_dismissed: true })
      .eq('id', notificationId);

    this.notifications.update(n => n.filter(notif => notif.id !== notificationId));
    this.updateUnreadCount();
  }

  getNotifications() { return this.notifications; }
  getUnreadCount()   { return this.unreadCount; }

  cleanup() {
    if (this.supabase && this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

export const notificationService = new NotificationService();
