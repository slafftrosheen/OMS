<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'flat' | 'glass' | 'glass-elevated';
  type Padding = 'none' | 'sm' | 'md' | 'lg';

  let {
    variant = 'flat',
    padding = 'md',
    href,
    onclick,
    class: className = '',
    children
  }: {
    variant?: Variant;
    padding?: Padding;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    class?: string;
    children?: Snippet;
  } = $props();

  const isInteractive = $derived(!!href || !!onclick);
  const tag = $derived(href ? 'a' : isInteractive ? 'button' : 'div');
</script>

{#if tag === 'a'}
  <a
    {href}
    class={['rf-card', className].filter(Boolean).join(' ')}
    data-variant={variant}
    data-padding={padding}
    data-interactive
  >
    {#if children}{@render children()}{/if}
  </a>
{:else if tag === 'button'}
  <button
    type="button"
    {onclick}
    class={['rf-card', className].filter(Boolean).join(' ')}
    data-variant={variant}
    data-padding={padding}
    data-interactive
  >
    {#if children}{@render children()}{/if}
  </button>
{:else}
  <div
    class={['rf-card', className].filter(Boolean).join(' ')}
    data-variant={variant}
    data-padding={padding}
  >
    {#if children}{@render children()}{/if}
  </div>
{/if}

<style>
  .rf-card {
    display: block;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    box-sizing: border-box;
  }

  /* Padding */
  .rf-card[data-padding="none"] { padding: 0; }
  .rf-card[data-padding="sm"]   { padding: var(--space-sm); }
  .rf-card[data-padding="md"]   { padding: var(--space-lg); }
  .rf-card[data-padding="lg"]   { padding: var(--space-xl); }

  /* Flat */
  .rf-card[data-variant="flat"] {
    background: var(--bg-1);
    box-shadow: var(--elevation-1);
    transition:
      box-shadow   var(--motion-sm) var(--ease-standard),
      border-color var(--motion-sm) var(--ease-standard);
  }

  /* Glass */
  .rf-card[data-variant="glass"] {
    background: var(--glass-tint-bg);
    backdrop-filter: var(--glass-material-regular);
    -webkit-backdrop-filter: var(--glass-material-regular);
    border-color: var(--glass-border);
    box-shadow: var(--glass-shadow-sm);
    transition:
      box-shadow   var(--motion-sm) var(--ease-standard),
      border-color var(--motion-sm) var(--ease-standard),
      background   var(--motion-sm) var(--ease-standard);
  }

  /* Glass Elevated */
  .rf-card[data-variant="glass-elevated"] {
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border-color: var(--glass-border);
    box-shadow: var(--glass-shadow-lg);
    transition:
      box-shadow   var(--motion-sm) var(--ease-standard),
      border-color var(--motion-sm) var(--ease-standard),
      transform    var(--motion-sm) var(--ease-standard);
  }

  /* Interactive hover states */
  .rf-card[data-interactive] {
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .rf-card[data-interactive][data-variant="flat"]:hover {
    box-shadow: var(--elevation-2);
    border-color: color-mix(in oklab, var(--border) 50%, var(--text));
  }
  .rf-card[data-interactive][data-variant="glass"]:hover {
    background: var(--glass-tint-hover);
    box-shadow: var(--glass-shadow-md);
  }
  .rf-card[data-interactive][data-variant="glass-elevated"]:hover {
    box-shadow: var(--elevation-3), var(--glass-shadow-lg);
    transform: translateY(-2px);
  }
  .rf-card[data-interactive]:active {
    transform: translateY(0) scale(0.99);
  }
  .rf-card[data-interactive]:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
