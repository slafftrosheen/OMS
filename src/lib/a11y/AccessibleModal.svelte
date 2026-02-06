<!-- src/lib/a11y/AccessibleModal.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import { focusManager } from '$lib/a11y/focus-manager';

	let { children, footer,
		open = false,
		title,
		description = undefined,
		size = 'medium',
		closeOnEscape = true,
		closeOnBackdrop = true,
		onclose
	}: {
		open?: boolean;
		title: string;
		description?: string | undefined;
		size?: 'small' | 'medium' | 'large';
		closeOnEscape?: boolean;
		closeOnBackdrop?: boolean;
		onclose?: () => void;
	} = $props();

	let modalElement: HTMLElement;
	let releaseFocusTrap: (() => void) | undefined;

	$effect(() => {
		if (open && modalElement) {
			handleOpen();
		} else if (!open && releaseFocusTrap) {
			handleClose();
		}
	});

	function handleOpen() {
		// Save current focus
		focusManager.saveFocus();

		// Trap focus in modal
		releaseFocusTrap = focusManager.trapFocus(modalElement);

		// Prevent body scroll
		document.body.style.overflow = 'hidden';

		// Announce to screen readers
		focusManager.announce(`${title} dialog opened`, 'assertive');
	}

	function handleClose() {
		// Release focus trap
		if (releaseFocusTrap) {
			releaseFocusTrap();
			releaseFocusTrap = undefined;
		}

		// Restore body scroll
		document.body.style.overflow = '';

		// Restore previous focus
		focusManager.restoreFocus();
	}

	function close() {
		open = false;
		onclose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && closeOnEscape) {
			close();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (closeOnBackdrop && e.target === e.currentTarget) {
			close();
		}
	}

	onDestroy(() => {
		if (open) {
			handleClose();
		}
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop"
		transition:fade={{ duration: 200 }}
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div
			bind:this={modalElement}
			class="modal modal-{size}"
			transition:fly={{ y: 50, duration: 300 }}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			aria-describedby={description ? 'modal-description' : undefined}
		>
			<div class="modal-header">
				<h2 id="modal-title" class="modal-title">{title}</h2>
				<button
					class="modal-close"
					onclick={close}
					aria-label="Close dialog"
					type="button"
				>
					<X size={20} />
				</button>
			</div>

			{#if description}
				<p id="modal-description" class="modal-description sr-only">
					{description}
				</p>
			{/if}

			<div class="modal-body">
				{@render children?.()}
			</div>

			<div class="modal-footer">
				{@render footer?.()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal {
		background: var(--bg-0);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
		max-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
	}

	.modal-small {
		width: 100%;
		max-width: 400px;
	}

	.modal-medium {
		width: 100%;
		max-width: 600px;
	}

	.modal-large {
		width: 100%;
		max-width: 900px;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.modal-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text);
	}

	.modal-close {
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.modal-close:hover {
		background: var(--bg-1);
		color: var(--text);
	}

	.modal-close:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.modal-body {
		flex: 1;
		padding: 1.5rem;
		overflow-y: auto;
	}

	.modal-footer {
		padding: 1.5rem;
		border-top: 1px solid var(--border);
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.modal-footer:empty {
		display: none;
	}

	/* Screen reader only */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
