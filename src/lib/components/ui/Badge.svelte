<!-- src/lib/components/ui/Badge.svelte -->
<script lang="ts">
    let { 
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
    <slot />
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
        background-color: #dbeafe;
        color: #1e40af;
    }

    .badge-success {
        background-color: #dcfce7;
        color: #166534;
    }

    .badge-warning {
        background-color: #fef3c7;
        color: #92400e;
    }

    .badge-danger {
        background-color: #fee2e2;
        color: #991b1b;
    }

    .badge-info {
        background-color: #e0f2fe;
        color: #075985;
    }

    .badge-neutral {
        background-color: #f3f4f6;
        color: #374151;
    }

    .badge-dot-indicator {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background-color: currentColor;
    }
</style>