<!-- src/lib/components/ui/Button.svelte -->
<script lang="ts">
    let { children, 
        variant = 'primary', 
        size = 'md', 
        disabled = false, 
        loading = false, 
        type = 'button', 
        fullWidth = false, 
        icon = null, 
        iconPosition = 'left',
        onclick,
        ...restProps
    }: {
        variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
        size?: 'sm' | 'md' | 'lg';
        disabled?: boolean;
        loading?: boolean;
        type?: 'button' | 'submit' | 'reset';
        fullWidth?: boolean;
        icon?: string | null;
        iconPosition?: 'left' | 'right';
        onclick?: (event: MouseEvent) => void;
        [key: string]: any;
    } = $props();

    function handleClick(event: MouseEvent) {
        if (!disabled && !loading) {
            onclick?.(event);
        }
    }

    let classes = $derived([
        'btn',
        `btn-${variant}`,
        `btn-${size}`,
        fullWidth && 'btn-full',
        disabled && 'btn-disabled',
        loading && 'btn-loading'
    ].filter(Boolean).join(' '));
</script>

<button
    {type}
    class={classes}
    disabled={disabled || loading}
    onclick={handleClick}
    {...restProps}
>
    {#if loading}
        <span class="btn-spinner" aria-hidden="true"></span>
    {:else if icon && iconPosition === 'left'}
        <span class="btn-icon btn-icon-left" aria-hidden="true">{icon}</span>
    {/if}
    
    {@render children?.()}
    
    {#if !loading && icon && iconPosition === 'right'}
        <span class="btn-icon btn-icon-right" aria-hidden="true">{icon}</span>
    {/if}
</button>

<style>
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        font-weight: 500;
        border-radius: 0.375rem;
        border: 1px solid transparent;
        transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
        cursor: pointer;
        font-family: inherit;
        line-height: 1.5;
        text-decoration: none;
        white-space: nowrap;
    }

    .btn:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
    }

    /* Sizes */
    .btn-sm {
        padding: 0.375rem 0.75rem;
        font-size: 0.875rem;
    }

    .btn-md {
        padding: 0.5rem 1rem;
        font-size: 1rem;
    }

    .btn-lg {
        padding: 0.75rem 1.5rem;
        font-size: 1.125rem;
    }

    /* Variants */
    .btn-primary {
        background: var(--color-primary, var(--brand));
        color: var(--bg-0);
        border-color: var(--color-primary, var(--brand));
    }

    .btn-primary:hover:not(:disabled) {
        background: var(--color-primary-dark, var(--brand));
        border-color: var(--color-primary-dark, var(--brand));
    }

    .btn-secondary {
        background: var(--ink-secondary);
        color: var(--bg-0);
        border-color: var(--ink-secondary);
    }

    .btn-secondary:hover:not(:disabled) {
        background: var(--color-secondary-dark, var(--ink-tertiary));
        border-color: var(--color-secondary-dark, var(--ink-tertiary));
    }

    .btn-danger {
        background: var(--color-danger, var(--error));
        color: var(--bg-0);
        border-color: var(--color-danger, var(--error));
    }

    .btn-danger:hover:not(:disabled) {
        background: var(--color-danger-dark, var(--error));
        border-color: var(--color-danger-dark, var(--error));
    }

    .btn-ghost {
        background: transparent;
        color: var(--color-text, var(--ink-primary));
        border-color: transparent;
    }

    .btn-ghost:hover:not(:disabled) {
        background: var(--color-gray-100, var(--bg-2));
    }

    .btn-outline {
        background: transparent;
        color: var(--color-primary, var(--brand));
        border-color: var(--color-primary, var(--brand));
    }

    .btn-outline:hover:not(:disabled) {
        background: var(--color-primary, var(--brand));
        color: var(--bg-0);
    }

    /* States */
    .btn-disabled,
    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-loading {
        position: relative;
        color: transparent;
        pointer-events: none;
    }

    .btn-full {
        width: 100%;
    }

    /* Spinner */
    .btn-spinner {
        position: absolute;
        width: 1rem;
        height: 1rem;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .btn-icon {
        display: inline-flex;
        font-size: 1.25em;
    }
</style>