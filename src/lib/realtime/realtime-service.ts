/**
 * Real-time Service
 * Manages WebSocket connections for live order and notification updates
 * Uses Supabase Realtime for pub/sub messaging
 */

import { env } from '$env/dynamic/public';
import { supabase } from '$lib/supabase-client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { writable } from 'svelte/store';
import { notificationStore, type NotificationRealtimeStatus } from '$lib/stores/notifications';
import type { Notification as StoredNotification } from '$lib/notifications/notification-model';

export interface RealtimeOrderUpdate {
  id: string;
  action: 'created' | 'updated' | 'deleted';
  order: any;
  timestamp: string;
  userId: string;
  userName: string;
}

export interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId?: string;
  userId: string;
  timestamp: string;
  read: boolean;
}

// Connection state store
export const connectionState = writable<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected');

// Real-time updates stores
export const realtimeOrders = writable<RealtimeOrderUpdate[]>([]);
export const realtimeNotifications = writable<RealtimeNotification[]>([]);

const supabaseUrl = env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

class RealtimeService {
  private orderChannel: RealtimeChannel | null = null;
  private orderStatus: NotificationRealtimeStatus = 'disconnected';
  private notificationStatus: NotificationRealtimeStatus = 'disconnected';
  private stopNotifications: (() => void) | null = null;
  private stopNotificationStatus: (() => void) | null = null;
  private activeUserId: string | null = null;
  private channelSequence = 0;

  connect(userId: string): void {
    if (!userId || this.activeUserId === userId) return;
    this.disconnect();

    if (!isSupabaseConfigured) {
      console.warn('[Realtime] Supabase credentials not configured, realtime disabled');
      return;
    }

    this.activeUserId = userId;
    this.orderStatus = 'connecting';
    this.notificationStatus = 'connecting';
    this.updateConnectionState();

    this.stopNotifications = notificationStore.connect(userId, notification => {
      if (this.activeUserId === userId) this.handleNotification(notification);
    });
    this.stopNotificationStatus = notificationStore.realtimeStatus.subscribe(status => {
      if (this.activeUserId !== userId) return;
      this.notificationStatus = status;
      this.updateConnectionState();
    });
    this.subscribeToOrders();
  }

  private subscribeToOrders(): void {
    // A manual retry can start before Supabase acknowledges the old topic's leave.
    const channel = supabase.channel(`oms-orders:${++this.channelSequence}`);
    this.orderChannel = channel;
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_orders' }, payload => {
        if (this.orderChannel === channel) this.handleOrderChange(payload);
      })
      .subscribe((status, error) => {
        if (this.orderChannel !== channel) return;
        if (status === 'SUBSCRIBED') {
          this.orderStatus = 'connected';
        } else {
          if (this.orderStatus !== 'error') console.warn('[Realtime] Orders subscription:', status, error);
          this.orderStatus = 'error';
        }
        this.updateConnectionState();
      });
  }

  private updateConnectionState(): void {
    if (this.orderStatus === 'error' || this.notificationStatus === 'error') {
      connectionState.set('error');
    } else if (this.orderStatus === 'connected' && this.notificationStatus === 'connected') {
      connectionState.set('connected');
    } else {
      connectionState.set('connecting');
    }
  }

  retry(userId: string): void {
    if (this.activeUserId !== userId) return;
    // The SDK rejoins established channels after transient network failures.
    // The Retry control also handles subscriptions the server closed outright.
    if (this.orderStatus === 'error') {
      this.releaseOrders();
      this.orderStatus = 'connecting';
      this.subscribeToOrders();
    }
    notificationStore.retryRealtime(userId);
    this.updateConnectionState();
  }

  private releaseOrders(): void {
    const channel = this.orderChannel;
    this.orderChannel = null;
    if (channel) void supabase.removeChannel(channel).catch(() => {});
  }

  disconnect(): void {
    this.activeUserId = null;
    this.stopNotificationStatus?.();
    this.stopNotificationStatus = null;
    this.stopNotifications?.();
    this.stopNotifications = null;
    this.releaseOrders();
    this.orderStatus = 'disconnected';
    this.notificationStatus = 'disconnected';
    realtimeOrders.set([]);
    realtimeNotifications.set([]);
    connectionState.set('disconnected');
  }

  /**
   * Handle order change events
   */
  private handleOrderChange(payload: any): void {
    const update: RealtimeOrderUpdate = {
      id: payload.new?.id || payload.old?.id,
      action: payload.eventType === 'INSERT' ? 'created' : 
              payload.eventType === 'UPDATE' ? 'updated' : 'deleted',
      order: payload.new || payload.old,
      timestamp: new Date().toISOString(),
      userId: payload.new?.updated_by || payload.new?.created_by || 'system',
      userName: 'Unknown User' // Will be enriched by component
    };

    // Add to store
    realtimeOrders.update(orders => [update, ...orders].slice(0, 100)); // Keep last 100

    // Emit custom event for components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('orderUpdate', { detail: update }));
    }
  }

  /**
   * Handle notification events
   */
  private handleNotification(item: StoredNotification): void {
    const notification: RealtimeNotification = {
      id: item.id,
      type: item.notification_type,
      title: item.title,
      message: item.message,
      orderId: item.reference_type === 'order' ? item.reference_id : undefined,
      userId: item.user_id,
      timestamp: item.created_at,
      read: item.read
    };
    realtimeNotifications.update(notifications => [notification, ...notifications].slice(0, 100));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notification', { detail: notification }));
    }
  }

  /**
   * Request browser notification permissions
   */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return await Notification.requestPermission();
    }
    return 'denied';
  }

  /**
   * Broadcast a custom message to all connected clients
   */
  async broadcast(channel: string, event: string, payload: any): Promise<void> {
    const broadcastChannel = supabase.channel(channel);
    await broadcastChannel.send({
      type: 'broadcast',
      event,
      payload
    });
  }
}

// Singleton instance
export const realtimeService = new RealtimeService();
