// src/lib/realtime/realtime-service.ts
import { supabase } from '$lib/supabase-client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface Presence {
	userId: string;
	username: string;
	displayName: string;
	orderId?: string;
	action: 'viewing' | 'editing';
	timestamp: number;
}

export interface OrderUpdate {
	id: string;
	type: 'stage_change' | 'assignment' | 'rework' | 'status_change' | 'comment';
	payload: any;
	userId: string;
	username: string;
	timestamp: string;
}

class RealtimeService {
	private channels: Map<string, RealtimeChannel> = new Map();
	private presence = writable<Map<string, Presence>>(new Map());
	private orderUpdates = writable<OrderUpdate[]>([]);
	private connectionStatus = writable<'connected' | 'disconnected' | 'connecting'>('disconnected');

	// Subscribe to order changes
	subscribeToOrders(callback: (update: OrderUpdate) => void): () => void {
		if (!browser) return () => {};

		const channelName = 'orders-channel';
		let channel = this.channels.get(channelName);

		if (!channel) {
			channel = supabase
				.channel(channelName)
				.on(
					'postgres_changes',
					{
						event: 'UPDATE',
						schema: 'public',
						table: 'draft_orders'
					},
					(payload: RealtimePostgresChangesPayload<any>) => {
						const update: OrderUpdate = {
							id: payload.new.id,
							type: this.detectChangeType(payload.old, payload.new),
							payload: payload.new,
							userId: payload.new.updated_by || 'system',
							username: payload.new.updated_by_name || 'System',
							timestamp: new Date().toISOString()
						};
						callback(update);
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'order_comments'
					},
					(payload: RealtimePostgresChangesPayload<any>) => {
						const update: OrderUpdate = {
							id: payload.new.order_id,
							type: 'comment',
							payload: payload.new,
							userId: payload.new.user_id,
							username: payload.new.username,
							timestamp: payload.new.created_at
						};
						callback(update);
					}
				)
				.subscribe((status) => {
					this.connectionStatus.set(
						status === 'SUBSCRIBED' ? 'connected' : 
						status === 'CLOSED' ? 'disconnected' : 'connecting'
					);
				});

			this.channels.set(channelName, channel);
		}

		// Return cleanup function
		return () => {
			if (channel) {
				supabase.removeChannel(channel);
				this.channels.delete(channelName);
			}
		};
	}

	// Track presence (who's viewing/editing what)
	trackPresence(orderId: string, action: 'viewing' | 'editing', user: any): () => void {
		if (!browser) return () => {};

		const channelName = `presence-order-${orderId}`;
		let channel = this.channels.get(channelName);

		if (!channel) {
			channel = supabase.channel(channelName, {
				config: {
					presence: {
						key: user.id
					}
				}
			});

			// Track presence changes
			channel
				.on('presence', { event: 'sync' }, () => {
					const state = channel!.presenceState();
					const presenceMap = new Map<string, Presence>();

					Object.entries(state).forEach(([userId, presences]: [string, any[]]) => {
						const latest = presences[0];
						presenceMap.set(userId, latest);
					});

					this.presence.set(presenceMap);
				})
				.on('presence', { event: 'join' }, ({ key, newPresences }) => {
					console.log('User joined:', key, newPresences);
				})
				.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
					console.log('User left:', key, leftPresences);
				})
				.subscribe(async (status) => {
					if (status === 'SUBSCRIBED') {
						// Track this user's presence
						await channel!.track({
							userId: user.id,
							username: user.username,
							displayName: user.displayName || user.username, // Corrected property name from display_name to displayName based on user-store
							orderId,
							action,
							timestamp: Date.now()
						});
					}
				});

			this.channels.set(channelName, channel);
		}

		// Return cleanup function
		return () => {
			if (channel) {
				channel.untrack();
				supabase.removeChannel(channel);
				this.channels.delete(channelName);
			}
		};
	}

	// Broadcast typing indicator
	broadcastTyping(orderId: string, user: any) {
		const channelName = `presence-order-${orderId}`;
		const channel = this.channels.get(channelName);

		if (channel) {
			channel.send({
				type: 'broadcast',
				event: 'typing',
				payload: {
					userId: user.id,
					username: user.username,
					timestamp: Date.now()
				}
			});
		}
	}

	private detectChangeType(oldData: any, newData: any): OrderUpdate['type'] {
		if (oldData?.status !== newData?.status) return 'status_change';
		if (JSON.stringify(oldData?.stages) !== JSON.stringify(newData?.stages)) return 'stage_change';
		if (JSON.stringify(oldData?.assignees) !== JSON.stringify(newData?.assignees)) return 'assignment';
		if (oldData?.rework_count !== newData?.rework_count) return 'rework';
		return 'status_change';
	}

	// Getters for stores
	getPresence() {
		return this.presence;
	}

	getConnectionStatus() {
		return this.connectionStatus;
	}

	// Cleanup all channels
	cleanup() {
		this.channels.forEach((channel) => {
			supabase.removeChannel(channel);
		});
		this.channels.clear();
	}
}

export const realtimeService = new RealtimeService();
