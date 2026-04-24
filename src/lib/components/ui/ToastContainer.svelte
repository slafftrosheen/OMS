<!-- src/lib/components/ui/ToastContainer.svelte -->
<script lang="ts">
    import { toasts } from '$lib/stores/toasts';
    import { fly, fade } from 'svelte/transition';

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
</script>

<div class="toast-container" aria-live="polite" aria-atomic="true">
    {#each $toasts as toast (toast.id)}
        <div
            class="toast toast-{toast.type}"
            role="alert"
            transition:fly={{ x: 300, duration: 300 }}
        >
            <div class="toast-icon">
                {icons[toast.type]}
            </div>
            <div class="toast-message">
                {toast.message}
            </div>
            <button
                class="toast-close"
                onclick={() => toasts.dismiss(toast.id)}
                aria-label="Dismiss notification"
            >
                ×
            </button>
        </div>
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: var(--z-tooltip);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        pointer-events: none;
        max-width: 400px;
    }

    .toast {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        background: white;
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px color-mix(in oklab, var(--bg-0) 10%, transparent),
                    0 4px 6px -2px color-mix(in oklab, var(--bg-0) 5%, transparent);
        pointer-events: auto;
        border-left: 4px solid;
    }

    .toast-success {
        border-left-color: var(--ok);
    }

    .toast-error {
        border-left-color: var(--error);
    }

    .toast-warning {
        border-left-color: var(--warn);
    }

    .toast-info {
        border-left-color: var(--brand);
    }

    .toast-icon {
        font-size: 1.25rem;
        font-weight: bold;
        flex-shrink: 0;
    }

    .toast-success .toast-icon { color: var(--ok); }
    .toast-error .toast-icon { color: var(--error); }
    .toast-warning .toast-icon { color: var(--warn); }
    .toast-info .toast-icon { color: var(--brand); }

    .toast-message {
        flex: 1;
        font-size: 0.875rem;
        color: var(--color-text, var(--ink-secondary));
    }

    .toast-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        line-height: 1;
        color: var(--color-gray-400, var(--muted));
        cursor: pointer;
        padding: 0;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0.25rem;
        transition: background-color 0.15s ease;
        flex-shrink: 0;
    }

    .toast-close:hover {
        background-color: var(--color-gray-100, var(--bg-2));
    }

    @media (max-width: 640px) {
        .toast-container {
            left: 1rem;
            right: 1rem;
            max-width: none;
        }
    }
</style>