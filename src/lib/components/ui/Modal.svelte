<!-- src/lib/components/ui/Modal.svelte -->
<script lang="ts">
    import { modalDialog } from '$lib/ui/modal-dialog';
    import { fade, fly } from 'svelte/transition';

    let { children, footer,
        open = $bindable(false),
        title = null as string | null,
        size = 'md' as 'sm' | 'md' | 'lg' | 'xl',
        closeOnClickOutside = true,
        closeOnEscape = true,
        showCloseButton = true,
        onclose
    }: {
        children?: import('svelte').Snippet;
        footer?: import('svelte').Snippet;
        open?: boolean;
        title?: string | null;
        size?: 'sm' | 'md' | 'lg' | 'xl';
        closeOnClickOutside?: boolean;
        closeOnEscape?: boolean;
        showCloseButton?: boolean;
        onclose?: () => void;
    } = $props();

    const dialogId = $props.id();

    function close() {
        open = false;
        onclose?.();
    }
</script>

{#if open}
    <dialog class="modal-backdrop" transition:fade={{ duration: 200 }}
        use:modalDialog={{ onClose: close, closeOnEscape, closeOnBackdrop: closeOnClickOutside }}
        aria-labelledby={title ? dialogId : undefined} aria-label={title ? undefined : "Dialog"}>
        <div
            class="modal-dialog modal-{size}"
            transition:fly={{ y: -50, duration: 300 }}
        >
            {#if title || showCloseButton}
                <div class="modal-header">
                    {#if title}
                        <h2 id={dialogId} class="modal-title">{title}</h2>
                    {/if}
                    {#if showCloseButton}
                        <button
                            type="button"
                            class="modal-close"
                            onclick={close}
                            aria-label="Close modal"
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    {/if}
                </div>
            {/if}

            <div class="modal-body">
                {@render children?.()}
            </div>

            {#if footer}
                <div class="modal-footer">
                    {@render footer?.()}
                </div>
            {/if}
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
        z-index: var(--z-modal);
        background-color: color-mix(in oklab, var(--bg-0) 55%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        overflow-y: auto;
    }

    .modal-dialog {
        background: var(--bg-1);
        border-radius: 0.5rem;
        box-shadow: 0 20px 25px -5px color-mix(in oklab, var(--bg-0) 10%, transparent),
                    0 10px 10px -5px oklch(0% 0 0 / 4%);
        width: 100%;
        max-height: calc(100vh - 2rem);
        display: flex;
        flex-direction: column;
        position: relative;
    }

    .modal-sm { max-width: 400px; }
    .modal-md { max-width: 600px; }
    .modal-lg { max-width: 800px; }
    .modal-xl { max-width: 1200px; }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.25rem;
        border-bottom: 1px solid var(--color-border, var(--border));
    }

    .modal-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, var(--ink-primary));
    }

    .modal-close {
        background: none;
        border: none;
        font-size: 2rem;
        line-height: 1;
        color: var(--color-gray-500, var(--ink-tertiary));
        cursor: pointer;
        padding: 0;
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0.25rem;
        transition: background-color 0.15s ease;
    }

    .modal-close:hover {
        background-color: var(--color-gray-100, var(--bg-2));
    }

    .modal-close:focus-visible {
        outline: 2px solid var(--color-primary, var(--brand));
        outline-offset: 2px;
    }

    .modal-body {
        padding: 1.25rem;
        overflow-y: auto;
        flex: 1;
    }

    .modal-footer {
        padding: 1.25rem;
        border-top: 1px solid var(--color-border, var(--border));
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
    }

    @media (max-width: 640px) {
        .modal-dialog {
            max-width: 100%;
            margin: 0;
            border-radius: 0;
            max-height: 100vh;
        }

        .modal-backdrop {
            padding: 0;
        }
    }
</style>