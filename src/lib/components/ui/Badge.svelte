<!-- src/lib/components/ui/Badge.svelte -->
<script lang="ts">
    let { children, 
        variant = 'neutral', 
        size = 'md', 
        rounded = true, 
        dot = false,
        ...restProps 
    }: { 
        variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
        size?: 'sm' | 'md' | 'lg';
        rounded?: boolean;
        dot?: boolean;
        [key: string]: any;
    } = $props();

    let classes = $derived([
        'badge',
        `badge-${variant}`,
        `badge-${size}`,
        rounded && 'badge-rounded',
        dot && 'badge-dot'
    ].filter(Boolean).join(' '));
</script>

<span class={classes} {...restProps}>
    {#if dot}
        <span class="badge-dot-indicator" aria-hidden="true"></span>
    {/if}
    {@render children?.()}
</span>

<style>
    .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
    }

    .badge-sm {
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
    }

    .badge-md {
        padding: 0.375rem 0.75rem;
        font-size: 0.875rem;
    }

    .badge-lg {
        padding: 0.5rem 1rem;
        font-size: 1rem;
    }

    .badge-rounded {
        border-radius: 9999px;
    }

    .badge-primary {
        background-color: var(--brand-soft);
        color: color-mix(in oklab, var(--brand) 85%, black);
    }

    .badge-success {
        background-color: var(--ok-soft);
        color: color-mix(in oklab, var(--ok) 60%, black);
    }

    .badge-warning {
        background-color: var(--warn-soft);
        color: color-mix(in oklab, var(--warn) 65%, black);
    }

    .badge-danger {
        background-color: var(--error-soft);
        color: color-mix(in oklab, var(--error) 85%, black);
    }

    .badge-info {
        background-color: var(--brand-soft);
        color: color-mix(in oklab, var(--brand) 60%, black);
    }

    .badge-neutral {
        background-color: var(--bg-2);
        color: var(--ink-secondary);
    }

    .badge-dot-indicator {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background-color: currentColor;
    }
</style>