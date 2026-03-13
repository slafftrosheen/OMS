// src/lib/order/realtime-order-store.ts
import { writable, get } from 'svelte/store';
import { realtimeService, connectionState, realtimeOrders, type RealtimeOrderUpdate } from '$lib/realtime/realtime-service';
import { browser } from '$app/environment';
import { currentUser } from '$lib/auth/user-store';
import { base } from '$app/paths';

// Placeholder for Presence since it's not exported/implemented yet
export type Presence = {
	id: string;
	orderId: string;
	userId: string;
	action: 'viewing' | 'editing';
	displayName: string;
	onlineAt: string;
};

interface OrderState {
	orders: Map<string, any>;
	optimisticUpdates: Map<string, any>;
	conflicts: Map<string, any>;
}

function createRealtimeOrderStore() {
	const state = writable<OrderState>({
		orders: new Map(),
		optimisticUpdates: new Map(),
		conflicts: new Map()
	});

	// Mock presence store for now since it's not in realtime-service
	const presence = writable<Presence[]>([]);

	let unsubscribe: (() => void) | null = null;

	return {
		subscribe: state.subscribe,
		presence,
		connectionStatus: connectionState,

		// Initialize real-time subscriptions
		init() {
			if (!browser || unsubscribe) return;

			// Subscribe to the realtimeOrders store from the service
			unsubscribe = realtimeOrders.subscribe((updates) => {
				// Process the latest update if available
				const latestUpdate = updates[0];
				if (latestUpdate) {
					this.handleOrderUpdate(latestUpdate);
				}
			});
		},

		// Handle incoming real-time updates
		handleOrderUpdate(update: RealtimeOrderUpdate) {
			const currentState = get(state);
			const order = currentState.orders.get(update.id);

			// If we are not tracking this order, we can ignore it or maybe update a list
			if (!order) return;

			// Check for conflicts with optimistic updates
			const optimisticUpdate = currentState.optimisticUpdates.get(update.id);
			if (optimisticUpdate) {
				// Conflict detected - server update differs from our optimistic update
				if (JSON.stringify(optimisticUpdate) !== JSON.stringify(update.order)) {
					currentState.conflicts.set(update.id, {
						local: optimisticUpdate,
						remote: update.order,
						timestamp: update.timestamp
					});

					// Notify user of conflict
					this.showConflictToast(update);
				}

				// Remove optimistic update
				currentState.optimisticUpdates.delete(update.id);
			}

			// Apply server update
			currentState.orders.set(update.id, update.order);
			state.set(currentState);

			// Show notification toast
			this.showUpdateToast(update);
		},

		// Optimistic update (before server confirms)
		updateOptimistic(orderId: string, changes: Partial<any>) {
			const currentState = get(state);
			const order = currentState.orders.get(orderId);

			if (!order) return;

			const updatedOrder = { ...order, ...changes };

			// Store optimistic update
			currentState.optimisticUpdates.set(orderId, updatedOrder);
			currentState.orders.set(orderId, updatedOrder);

			state.set(currentState);

			// Send to server
			this.syncToServer(orderId, changes);
		},

		// Sync to server
		async syncToServer(orderId: string, changes: Partial<any>) {
			try {
				const user = get(currentUser);
				const response = await fetch(`${base}/api/draft-orders/${orderId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						...changes,
						updated_by: (user as any)?.id,
						updated_by_name: user?.displayName
					})
				});

				if (!response.ok) {
					throw new Error('Failed to update order');
				}

				// Server confirmed - remove optimistic update
				const currentState = get(state);
				currentState.optimisticUpdates.delete(orderId);
				state.set(currentState);
			} catch (error) {
				console.error('Failed to sync order:', error);
				this.revertOptimistic(orderId);
			}
		},

		// Revert optimistic update on error
		revertOptimistic(orderId: string) {
			const currentState = get(state);
			currentState.optimisticUpdates.delete(orderId);

			// Refetch from server
			fetch(`${base}/api/draft-orders/${orderId}`)
				.then((res) => res.json())
				.then((order) => {
					currentState.orders.set(orderId, order);
					state.set(currentState);
				});
		},

		// Resolve conflict (choose local or remote)
		resolveConflict(orderId: string, choice: 'local' | 'remote') {
			const currentState = get(state);
			const conflict = currentState.conflicts.get(orderId);

			if (!conflict) return;

			const chosenVersion = choice === 'local' ? conflict.local : conflict.remote;

			currentState.orders.set(orderId, chosenVersion);
			currentState.conflicts.delete(orderId);

			state.set(currentState);

			// If local chosen, sync to server
			if (choice === 'local') {
				this.syncToServer(orderId, conflict.local);
			}
		},

		// Show toast notifications
		showUpdateToast(update: RealtimeOrderUpdate) {
			const user = get(currentUser);
			// Check if update is from current user
			// RealtimeOrderUpdate has userId
			// User object might not have id in its type definition, so casting for now
			const currentUserId = (user as any)?.id;
			
			if (currentUserId && update.userId === currentUserId) return;

			const message = `${update.userName} ${update.action} order ${update.id}`;
			this.showToast(message, 'info');
		},

		showConflictToast(update: RealtimeOrderUpdate) {
			this.showToast(
				`Conflict detected for order ${update.id}. Your changes may have been overwritten.`,
				'warning'
			);
		},

		showToast(message: string, type: 'info' | 'warning' | 'error') {
			// Use your existing toast/notification system
			if (browser) {
				const event = new CustomEvent('show-toast', {
					detail: { message, type }
				});
				window.dispatchEvent(event);
			}
		},

		// Track presence for an order
		trackPresence(orderId: string, action: 'viewing' | 'editing') {
			// Stub implementation until Presence is supported in RealtimeService
			return () => {};
		},

		// Cleanup
		cleanup() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
			// realtimeService.disconnect(); // Don't disconnect global service, just unsubscribe listener
		}
	};
}

export const realtimeOrderStore = createRealtimeOrderStore();
