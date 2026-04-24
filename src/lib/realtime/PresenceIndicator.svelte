<!-- src/lib/realtime/PresenceIndicator.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Presence } from '$lib/order/realtime-order-store';


	let viewers: Presence[] = $state([]);
	let editors: Presence[] = $state([]);

	// Import from realtime order store
	import { realtimeOrderStore } from '$lib/order/realtime-order-store';
	interface Props {
		orderId: string;
		currentUserId: string;
	}

	let { orderId, currentUserId }: Props = $props();

	onMount(() => {
		// Subscribe to presence updates
		const unsubscribe = realtimeOrderStore.presence.subscribe((presenceMap) => {
			viewers = [];
			editors = [];

			presenceMap.forEach((presence) => {
				if (presence.orderId === orderId && presence.userId !== currentUserId) {
					if (presence.action === 'viewing') {
						viewers.push(presence);
					} else {
						editors.push(presence);
					}
				}
			});
		});

		return () => {
			unsubscribe();
		};
	});

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

{#if viewers.length > 0 || editors.length > 0}
	<div class="presence-indicator">
		<div class="presence-list">
			{#each editors as editor}
				<div class="presence-avatar editing" title="{editor.displayName} is editing">
					<span class="initials">{getInitials(editor.displayName)}</span>
					<span class="pulse"></span>
				</div>
			{/each}

			{#each viewers as viewer}
				<div class="presence-avatar viewing" title="{viewer.displayName} is viewing">
					<span class="initials">{getInitials(viewer.displayName)}</span>
				</div>
			{/each}
		</div>

		<div class="presence-text">
			{#if editors.length > 0}
				<span class="editing-indicator">
					{editors.length === 1 ? editors[0].displayName : `${editors.length} users`} editing
				</span>
			{/if}
			{#if viewers.length > 0}
				<span class="viewing-indicator">
					{viewers.length} viewing
				</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.presence-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--bg-1);
		border-radius: 8px;
		border: 1px solid var(--border);
	}

	.presence-list {
		display: flex;
		gap: -0.5rem;
	}

	.presence-avatar {
		position: relative;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--bg-0);
		border: 2px solid var(--bg-1);
	}

	.presence-avatar.editing {
		background: var(--accent-1);
	}

	.presence-avatar.viewing {
		background: var(--muted);
	}

	.pulse {
		position: absolute;
		top: -2px;
		right: -2px;
		width: 10px;
		height: 10px;
		background: var(--ok);
		border-radius: 50%;
		border: 2px solid var(--bg-1);
		animation: pulse 2s infinite;
	}

	 @keyframes pulse {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.1);
		}
	}

	.presence-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
	}

	.editing-indicator {
		color: var(--accent-1);
		font-weight: 600;
	}

	.viewing-indicator {
		color: var(--muted);
		font-size: 0.75rem;
	}
</style>
