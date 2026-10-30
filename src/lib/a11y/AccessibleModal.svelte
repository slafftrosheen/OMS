<!-- src/lib/a11y/AccessibleModal.svelte -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
	import { fly, fade } from 'svelte/transition';
	import { modalDialog } from '$lib/ui/modal-dialog';

	let { children, footer,
		open = $bindable(false),
		title,
		description = undefined,
		size = 'medium',
		closeOnEscape = true,
		closeOnBackdrop = true,
		onclose
	}: {
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
		open?: boolean;
		title: string;
		description?: string | undefined;
		size?: 'small' | 'medium' | 'large';
		closeOnEscape?: boolean;
		closeOnBackdrop?: boolean;
		onclose?: () => void;
	} = $props();

	const dialogId = $props.id();
	function close() { open = false; onclose?.(); }
</script>

{#if open}
	<dialog
		class="modal-backdrop"
		transition:fade={{ duration: 200 }}
		use:modalDialog={{ onClose: close, closeOnEscape, closeOnBackdrop }}
		aria-labelledby={`${dialogId}-title`}
		aria-describedby={description ? `${dialogId}-description` : undefined}
	>
		<div class="modal modal-{size}" transition:fly={{ y: 50, duration: 300 }}>
			<div class="modal-header">
				<h2 id={`${dialogId}-title`} class="modal-title">{title}</h2>
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
				<p id={`${dialogId}-description`} class="modal-description sr-only">
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
	</dialog>
{/if}

<style>
  .modal-backdrop:not([open]) { display:none; }
  .modal-backdrop::backdrop { background:transparent; }
	.modal-backdrop {
    margin: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border: 0;
    color: inherit;
		position: fixed;
		inset: 0;
		z-index: var(--z-tooltip);
		background: color-mix(in oklab, var(--bg-0) 55%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal {
		background: var(--bg-0);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 20px 25px -5px color-mix(in oklab, var(--bg-0) 10%, transparent),
			0 10px 10px -5px oklch(0% 0 0 / 4%);
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
