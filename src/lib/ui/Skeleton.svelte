<!--
  Skeleton loader — token-driven shimmer for data-heavy surfaces.

  Usage:
    <Skeleton />                       1em-tall pill
    <Skeleton width="60%" />           explicit width
    <Skeleton height="160px" />        block placeholder
    <Skeleton lines={4} gap="0.5em" /> multiple lines
    <Skeleton circle size="48px" />    avatar placeholder

  Honours `prefers-reduced-motion: reduce` automatically.
-->

<script lang="ts">
    type Props = {
        width?: string;
        height?: string;
        radius?: string;
        lines?: number;
        gap?: string;
        circle?: boolean;
        size?: string;
        class?: string;
    };

    let {
        width = '100%',
        height,
        radius = 'var(--radius-sm)',
        lines = 1,
        gap = '0.5rem',
        circle = false,
        size,
        class: className = ''
    }: Props = $props();

    const resolvedHeight = height ?? (circle ? size ?? '40px' : '1em');
    const resolvedWidth  = circle ? (size ?? '40px') : width;
    const resolvedRadius = circle ? '50%' : radius;
</script>

{#if lines > 1}
    <div class="rf-skeleton-stack {className}" style:gap>
        {#each Array(lines) as _, i (i)}
            <span
                class="rf-skeleton"
                style:width={i === lines - 1 ? '70%' : resolvedWidth}
                style:height={resolvedHeight}
                style:border-radius={resolvedRadius}
                aria-hidden="true"
            ></span>
        {/each}
    </div>
{:else}
    <span
        class="rf-skeleton {className}"
        style:width={resolvedWidth}
        style:height={resolvedHeight}
        style:border-radius={resolvedRadius}
        aria-hidden="true"
    ></span>
{/if}

<style>
    .rf-skeleton-stack { display: flex; flex-direction: column; }

    .rf-skeleton {
        display: inline-block;
        background:
            linear-gradient(
                90deg,
                color-mix(in oklab, var(--bg-2) 70%, transparent) 0%,
                color-mix(in oklab, var(--bg-1) 90%, white)       50%,
                color-mix(in oklab, var(--bg-2) 70%, transparent) 100%
            );
        background-size: 200% 100%;
        animation: rf-skeleton-shimmer 1.6s var(--ease-standard, cubic-bezier(.2,.8,.2,1)) infinite;
        will-change: background-position;
    }

    @keyframes rf-skeleton-shimmer {
        from { background-position: 200% 0; }
        to   { background-position: -200% 0; }
    }

    @media (prefers-reduced-motion: reduce) {
        .rf-skeleton {
            animation: none;
            background: color-mix(in oklab, var(--bg-2) 80%, var(--bg-1));
        }
    }
</style>
