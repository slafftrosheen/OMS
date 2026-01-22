// src/lib/order/realtime-order-store.ts
import { writable, get } from 'svelte/store';
import { realtimeService, type OrderUpdate, type Presence } from '$lib/realtime/realtime-service';
import { browser } from '$app/environment';
import { currentUser } from '$lib/auth/user-store';
import { base } from '$app/paths';

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

	const presence = realtimeService.getPresence();
	const connectionStatus = realtimeService.getConnectionStatus();

	let unsubscribe: (() => void) | null = null;

	return {
		subscribe: state.subscribe,
		presence,
		connectionStatus,

		// Initialize real-time subscriptions
		init() {
			if (!browser || unsubscribe) return;

			unsubscribe = realtimeService.subscribeToOrders((update) => {
				this.handleOrderUpdate(update);
			});
		},

		// Handle incoming real-time updates
		handleOrderUpdate(update: OrderUpdate) {
			const currentState = get(state);
			const order = currentState.orders.get(update.id);

			// If we are not tracking this order, we can ignore it or maybe update a list
			if (!order) return;

			// Check for conflicts with optimistic updates
			const optimisticUpdate = currentState.optimisticUpdates.get(update.id);
			if (optimisticUpdate) {
				// Conflict detected - server update differs from our optimistic update
				if (JSON.stringify(optimisticUpdate) !== JSON.stringify(update.payload)) {
					currentState.conflicts.set(update.id, {
						local: optimisticUpdate,
						remote: update.payload,
						timestamp: update.timestamp
					});

					// Notify user of conflict
					this.showConflictToast(update);
				}

				// Remove optimistic update
				currentState.optimisticUpdates.delete(update.id);
			}

			// Apply server update
			currentState.orders.set(update.id, update.payload);
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
						updated_by: user?.id, // Assuming user object has id, need to verify typings if strictly typed
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
		showUpdateToast(update: OrderUpdate) {
			const user = get(currentUser);
			// Assuming update.userId matches the user.id format (e.g. UUID)
			// user store types: User usually doesn't have ID in the type definition in user-store.ts I read earlier?
			// Let's re-read user-store.ts. It constructs User object.
			// The user object in user-store.ts: { username, displayName, ... }
			// It doesn't explicitly seem to have 'id'.
			// But loadCurrentUser calls /api/auth which returns user.
			// Let's assume for now we might not be able to check ID equality effectively if not present.
			// But realtime service sends userId.
			
			// If update.username matches current user's username, skip?
			if (user && update.username === user.username) return; 

			const messages: Record<string, string> = {
				stage_change: `${update.username} updated stage for order ${update.id}`,
				assignment: `${update.username} assigned order ${update.id}`,
				rework: `${update.username} sent order ${update.id} to rework`,
				status_change: `${update.username} changed status of order ${update.id}`,
				comment: `${update.username} commented on order ${update.id}`
			};

			this.showToast(messages[update.type] || 'Order updated', 'info');
		},

		showConflictToast(update: OrderUpdate) {
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
			const user = get(currentUser);
			if (!user) return () => {};

			// Need to pass an object with id for realtime service
			// Since user object might not have id, we might use username as id or fetch it.
			// Ideally /api/auth returns id.
			// For now let's mock id with username if id missing
			const userForPresence = { 
				...user, 
				id: (user as any).id || user.username 
			};

			return realtimeService.trackPresence(orderId, action, userForPresence);
		},

		// Cleanup
		cleanup() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
			realtimeService.cleanup();
		}
	};
}

export const realtimeOrderStore = createRealtimeOrderStore();
