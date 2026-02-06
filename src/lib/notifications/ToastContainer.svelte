<!-- src/lib/notifications/ToastContainer.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { Bell, AlertCircle, CheckCircle, Info, X } from 'lucide-svelte';

	interface Toast {
		id: string;
		message: string;
		type: 'info' | 'success' | 'warning' | 'error';
		duration?: number;
	}

	let toasts: Toast[] = $state([]);

	onMount(() => {
		// Listen for toast events
		const handleToast = (event: CustomEvent) => {
			const { message, type = 'info', duration = 5000 } = event.detail;
			addToast(message, type, duration);
		};

		window.addEventListener('show-toast', handleToast as EventListener);

		return () => {
			window.removeEventListener('show-toast', handleToast as EventListener);
		};
	});

	function addToast(message: string, type: Toast['type'], duration: number) {
		const id = crypto.randomUUID();
		const toast: Toast = { id, message, type, duration };

		toasts = [...toasts, toast];

		if (duration > 0) {
			setTimeout(() => {
				removeToast(id);
			}, duration);
		}
	}

	function removeToast(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function getIcon(type: Toast['type']) {
		switch (type) {
			case 'success': return CheckCircle;
			case 'warning': return AlertCircle;
			case 'error': return AlertCircle;
			default: return Info;
		}
	}
</script>

<div class="toast-container" aria-live="polite" aria-atomic="true">
	{#each toasts as toast (toast.id)}
		{@const SvelteComponent = getIcon(toast.type)}
		<div
			class="toast toast-{toast.type}"
			transition:fly={{ y: 50, duration: 300 }}
			role="alert"
		>
			<div class="toast-icon">
				<SvelteComponent size={20} />
			</div>
			<div class="toast-message">{toast.message}</div>
			<button
				class="toast-close"
				onclick={() => removeToast(toast.id)}
				aria-label="Close notification"
			>
				<X size={16} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 400px;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 300px;
	}

	.toast-info {
		border-left: 4px solid var(--accent-1);
	}

	.toast-success {
		border-left: 4px solid #10b981;
	}

	.toast-warning {
		border-left: 4px solid #f59e0b;
	}

	.toast-error {
		border-left: 4px solid #ef4444;
	}

	.toast-icon {
		flex-shrink: 0;
	}

	.toast-info .toast-icon {
		color: var(--accent-1);
	}

	.toast-success .toast-icon {
		color: #10b981;
	}

	.toast-warning .toast-icon {
		color: #f59e0b;
	}

	.toast-error .toast-icon {
		color: #ef4444;
	}

	.toast-message {
		flex: 1;
		font-size: 0.875rem;
		color: var(--text);
	}

	.toast-close {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
	}

	.toast-close:hover {
		background: var(--bg-2);
		color: var(--text);
	}

	 @media (max-width: 768px) {
		.toast-container {
			left: 1rem;
			right: 1rem;
			max-width: none;
		}

		.toast {
			min-width: auto;
		}
	}
</style>
