<!-- src/lib/components/ui/Card.svelte -->
<script lang="ts">
    export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
    export let hoverable = false;
    export let clickable = false;
    export let href: string | null = null;

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
    on:click
    {...$$restProps}
>
    {#if $$slots.header}
        <div class="card-header">
            <slot name="header" />
        </div>
    {/if}

    <div class="card-body">
        <slot />
    </div>

    {#if $$slots.footer}
        <div class="card-footer">
            <slot name="footer" />
        </div>
    {/if}
</svelte:element>

<style>
    .card {
        background: white;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 0.5rem;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        transition: box-shadow 0.15s ease, transform 0.15s ease;
    }

    .card-hoverable:hover {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
                    0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }

    .card-clickable {
        cursor: pointer;
    }

    .card-clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
                    0 4px 6px -2px rgba(0, 0, 0, 0.05);
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
        border-bottom: 1px solid var(--color-border, #e5e7eb);
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
        border-top: 1px solid var(--color-border, #e5e7eb);
        background-color: var(--color-gray-50, #f9fafb);
    }
</style>