<!-- src/lib/components/ui/Card.svelte -->
<script lang="ts">
    import type { Snippet } from 'svelte';

    let { 
        padding = 'md',
        hoverable = false, 
        clickable = false, 
        href = null,
        onclick,
        header,
        children,
        footer,
        ...restProps
    }: { 
        padding?: 'none' | 'sm' | 'md' | 'lg';
        hoverable?: boolean;
        clickable?: boolean;
        href?: string | null;
        onclick?: (e: MouseEvent) => void;
        header?: Snippet;
        children?: Snippet;
        footer?: Snippet;
        [key: string]: any;
    } = $props();

    let component = $derived(href ? 'a' : 'div');
    let classes = $derived([
        'card',
        `card-padding-${padding}`,
        hoverable && 'card-hoverable',
        clickable && 'card-clickable'
    ].filter(Boolean).join(' '));
</script>

<svelte:element
    this={component}
    {href}
    class={classes}
    {onclick}
    {...restProps}
>
    {#if header}
        <div class="card-header">
            {@render header()}
        </div>
    {/if}

    <div class="card-body">
        {#if children}
            {@render children()}
        {/if}
    </div>

    {#if footer}
        <div class="card-footer">
            {@render footer()}
        </div>
    {/if}
</svelte:element>

<style>
    .card {
        background: white;
        border: 1px solid var(--color-border, var(--border));
        border-radius: 0.5rem;
        box-shadow: 0 1px 2px 0 color-mix(in oklab, var(--bg-0) 5%, transparent);
        display: flex;
        flex-direction: column;
        transition: box-shadow 0.15s ease, transform 0.15s ease;
    }

    .card-hoverable:hover {
        box-shadow: 0 4px 6px -1px color-mix(in oklab, var(--bg-0) 10%, transparent),
                    0 2px 4px -1px oklch(0% 0 0 / 6%);
    }

    .card-clickable {
        cursor: pointer;
    }

    .card-clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px color-mix(in oklab, var(--bg-0) 10%, transparent),
                    0 4px 6px -2px color-mix(in oklab, var(--bg-0) 5%, transparent);
    }

    .card-clickable:active {
        transform: translateY(0);
    }

    a.card {
        text-decoration: none;
        color: inherit;
    }

    .card-header {
        padding: 1.25rem;
        border-bottom: 1px solid var(--color-border, var(--border));
        font-weight: 600;
    }

    .card-body {
        flex: 1;
    }

    .card-padding-none .card-body {
        padding: 0;
    }

    .card-padding-sm .card-body {
        padding: 0.75rem;
    }

    .card-padding-md .card-body {
        padding: 1.25rem;
    }

    .card-padding-lg .card-body {
        padding: 2rem;
    }

    .card-footer {
        padding: 1rem 1.25rem;
        border-top: 1px solid var(--color-border, var(--border));
        background-color: var(--color-gray-50, var(--bg-2));
    }
</style>