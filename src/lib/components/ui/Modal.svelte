<!-- src/lib/components/ui/Modal.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly } from 'svelte/transition';

    let {
        open = false,
        title = null as string | null,
        size = 'md' as 'sm' | 'md' | 'lg' | 'xl',
        closeOnClickOutside = true,
        closeOnEscape = true,
        showCloseButton = true,
        onclose
    }: {
        open?: boolean;
        title?: string | null;
        size?: 'sm' | 'md' | 'lg' | 'xl';
        closeOnClickOutside?: boolean;
        closeOnEscape?: boolean;
        showCloseButton?: boolean;
        onclose?: () => void;
    } = $props();

    let dialogElement: HTMLDivElement;
    let previousActiveElement: HTMLElement | null = $state(null);

    $effect(() => {
        if (open) {
            previousActiveElement = document.activeElement as HTMLElement;
            setTimeout(() => {
                const firstFocusable = dialogElement?.querySelector<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                firstFocusable?.focus();
            }, 100);
        } else {
            previousActiveElement?.focus();
            previousActiveElement = null;
        }
    });

    function close() {
        open = false;
        onclose?.();
    }

    function handleBackdropClick(event: MouseEvent) {
        if (closeOnClickOutside && event.target === event.currentTarget) {
            close();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (closeOnEscape && event.key === 'Escape') {
            close();
        }

        // Trap focus within modal
        if (event.key === 'Tab' && open) {
            const focusableElements = dialogElement.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement?.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement?.focus();
            }
        }
    }

    onMount(() => {
        return () => {
            previousActiveElement?.focus();
        };
    });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
    <div class="modal-backdrop" transition:fade={{ duration: 200 }} onclick={handleBackdropClick}>
        <div
            bind:this={dialogElement}
            class="modal-dialog modal-{size}"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            transition:fly={{ y: -50, duration: 300 }}
        >
            {#if title || showCloseButton}
                <div class="modal-header">
                    {#if title}
                        <h2 id="modal-title" class="modal-title">{title}</h2>
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
                <slot />
            </div>

            {#if $$slots.footer}
                <div class="modal-footer">
                    <slot name="footer" />
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        overflow-y: auto;
    }

    .modal-dialog {
        background: white;
        border-radius: 0.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
                    0 10px 10px -5px rgba(0, 0, 0, 0.04);
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
        border-bottom: 1px solid var(--color-border, #e5e7eb);
    }

    .modal-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text, #111827);
    }

    .modal-close {
        background: none;
        border: none;
        font-size: 2rem;
        line-height: 1;
        color: var(--color-gray-500, #6b7280);
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
        background-color: var(--color-gray-100, #f3f4f6);
    }

    .modal-close:focus-visible {
        outline: 2px solid var(--color-primary, #0066cc);
        outline-offset: 2px;
    }

    .modal-body {
        padding: 1.25rem;
        overflow-y: auto;
        flex: 1;
    }

    .modal-footer {
        padding: 1.25rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
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