/**
 * Real-time Service
 * Manages WebSocket connections for live order and notification updates
 * Uses Supabase Realtime for pub/sub messaging
 */

import { env } from '$env/dynamic/public';
import { supabase } from '$lib/supabase-client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { writable, get } from 'svelte/store';

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
  type: 'order_update' | 'stage_change' | 'rework' | 'comment' | 'assignment';
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
  private notificationChannel: RealtimeChannel | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  /**
   * Initialize real-time subscriptions for a user
   * @param userId - Current authenticated user ID
   */
  async connect(userId: string): Promise<void> {
    if (!userId) {
      console.error('[Realtime] Cannot connect without userId');
      return;
    }

    if (!isSupabaseConfigured) {
      console.warn('[Realtime] Supabase credentials not configured, realtime disabled');
      connectionState.set('disconnected');
      return;
    }

    connectionState.set('connecting');

    try {
      // Subscribe to order updates
      await this.subscribeToOrders(userId);
      
      // Subscribe to user notifications
      await this.subscribeToNotifications(userId);
      
      connectionState.set('connected');
      this.reconnectAttempts = 0;
      
      console.log('[Realtime] Connected successfully');
    } catch (error) {
      console.error('[Realtime] Connection error:', error);
      connectionState.set('error');
      this.handleReconnect(userId);
    }
  }

  /**
   * Subscribe to order changes
   */
  private async subscribeToOrders(userId: string): Promise<void> {
    this.orderChannel = supabase
      .channel('orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draft_orders'
        },
        (payload) => {
          this.handleOrderChange(payload, userId);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed to orders');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] Order subscription error:', status);
          this.handleReconnect(userId);
        }
      });
  }

  /**
   * Subscribe to user notifications
   */
  private async subscribeToNotifications(userId: string): Promise<void> {
    this.notificationChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          this.handleNotification(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed to notifications');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] Notification subscription error:', status);
          this.handleReconnect(userId);
        }
      });
  }

  /**
   * Handle order change events
   */
  private handleOrderChange(payload: any, userId: string): void {
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
  private handleNotification(payload: any): void {
    const notification: RealtimeNotification = {
      id: payload.new.id,
      type: payload.new.type,
      title: payload.new.title,
      message: payload.new.message,
      orderId: payload.new.order_id,
      userId: payload.new.user_id,
      timestamp: payload.new.created_at,
      read: false
    };

    // Add to store
    realtimeNotifications.update(notifs => [notification, ...notifs]);

    // Show browser notification if permitted
    this.showBrowserNotification(notification);

    // Emit custom event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notification', { detail: notification }));
    }
  }

  /**
   * Show browser notification
   */
  private showBrowserNotification(notification: RealtimeNotification): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: notification.id
        });
      }
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(userId: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Realtime] Max reconnection attempts reached');
      connectionState.set('error');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.disconnect();
      this.connect(userId);
    }, delay);
  }

  /**
   * Disconnect all channels
   */
  async disconnect(): Promise<void> {
    if (this.orderChannel) {
      await supabase.removeChannel(this.orderChannel);
      this.orderChannel = null;
    }

    if (this.notificationChannel) {
      await supabase.removeChannel(this.notificationChannel);
      this.notificationChannel = null;
    }

    connectionState.set('disconnected');
    console.log('[Realtime] Disconnected');
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
