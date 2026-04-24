<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'glass' | 'danger' | 'success';
  type Size = 'sm' | 'md' | 'lg';

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    type = 'button',
    loading = false,
    iconLeft,
    iconRight,
    onclick,
    children
  }: {
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    type?: 'button' | 'submit';
    loading?: boolean;
    iconLeft?: IconName;
    iconRight?: IconName;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button
  {type}
  disabled={disabled || loading}
  class="rf-btn"
  data-variant={variant}
  data-size={size}
  data-loading={loading || null}
  {onclick}
>
  {#if loading}
    <span class="rf-btn__spinner" aria-hidden="true"></span>
  {:else if iconLeft}
    <Icon name={iconLeft} size="sm" />
  {/if}
  {#if children}
    <span class="rf-btn__label">{@render children()}</span>
  {/if}
  {#if iconRight && !loading}
    <Icon name={iconRight} size="sm" />
  {/if}
</button>

<style>
  .rf-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    font-family: var(--font-sans);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    white-space: nowrap;
    line-height: 1;
    transition:
      background    var(--motion-sm) var(--ease-standard),
      border-color  var(--motion-sm) var(--ease-standard),
      box-shadow    var(--motion-sm) var(--ease-standard),
      color         var(--motion-sm) var(--ease-standard),
      transform     var(--motion-xs) var(--ease-emphasized),
      filter        var(--motion-xs) var(--ease-emphasized);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* Sizes */
  .rf-btn[data-size="sm"] {
    height: var(--control-xs, 28px);
    padding: 0 var(--space-sm);
    font-size: var(--text-xs);
    border-radius: var(--radius-sm);
    gap: var(--space-xxs);
  }
  .rf-btn[data-size="md"] {
    height: var(--control-sm, 36px);
    padding: 0 var(--space-md);
    font-size: var(--text-sm);
  }
  .rf-btn[data-size="lg"] {
    height: var(--control-md, 44px);
    padding: 0 var(--space-lg);
    font-size: var(--text-md);
    border-radius: var(--radius-lg);
  }

  /* === Variants === */

  /* Primary */
  .rf-btn[data-variant="primary"] {
    background: var(--brand);
    color: var(--bg-0);
    box-shadow: var(--elevation-1), inset 0 1px 0 color-mix(in oklab, white 20%, transparent);
  }
  .rf-btn[data-variant="primary"]:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand) 85%, var(--bg-0));
    box-shadow: var(--elevation-2), inset 0 1px 0 color-mix(in oklab, white 20%, transparent);
    transform: translateY(-1px);
  }
  .rf-btn[data-variant="primary"]:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    filter: brightness(0.95);
    box-shadow: var(--elevation-0);
  }

  /* Secondary */
  .rf-btn[data-variant="secondary"] {
    background: color-mix(in oklab, var(--bg-1) 55%, var(--bg-0));
    color: var(--ink-primary);
    border-color: var(--border);
    box-shadow: var(--elevation-1);
  }
  .rf-btn[data-variant="secondary"]:hover:not(:disabled) {
    background: var(--bg-2);
    border-color: color-mix(in oklab, var(--border) 50%, var(--text));
    transform: translateY(-1px);
    box-shadow: var(--elevation-2);
  }
  .rf-btn[data-variant="secondary"]:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    box-shadow: var(--elevation-0);
  }

  /* Tertiary */
  .rf-btn[data-variant="tertiary"] {
    background: transparent;
    color: var(--brand);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
  }
  .rf-btn[data-variant="tertiary"]:hover:not(:disabled) {
    background: var(--brand-soft);
    border-color: color-mix(in oklab, var(--brand) 65%, transparent);
  }
  .rf-btn[data-variant="tertiary"]:active:not(:disabled) {
    transform: scale(0.97);
    background: var(--brand-strong);
  }

  /* Ghost */
  .rf-btn[data-variant="ghost"] {
    background: transparent;
    color: var(--ink-secondary);
    border-color: transparent;
  }
  .rf-btn[data-variant="ghost"]:hover:not(:disabled) {
    background: var(--bg-2);
    color: var(--ink-primary);
  }
  .rf-btn[data-variant="ghost"]:active:not(:disabled) {
    transform: scale(0.97);
    background: color-mix(in oklab, var(--bg-2) 80%, var(--bg-1));
  }

  /* Glass */
  .rf-btn[data-variant="glass"] {
    background: var(--glass-tint-bg);
    color: var(--ink-primary);
    border-color: var(--glass-border);
    backdrop-filter: var(--glass-material-regular);
    -webkit-backdrop-filter: var(--glass-material-regular);
    box-shadow: var(--glass-shadow-sm);
  }
  .rf-btn[data-variant="glass"]:hover:not(:disabled) {
    background: var(--glass-tint-hover);
    box-shadow: var(--glass-shadow-md);
    transform: translateY(-1px);
  }
  .rf-btn[data-variant="glass"]:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
  }

  /* Danger */
  .rf-btn[data-variant="danger"] {
    background: var(--error);
    color: var(--bg-0);
    box-shadow: var(--elevation-1);
  }
  .rf-btn[data-variant="danger"]:hover:not(:disabled) {
    background: color-mix(in oklab, var(--error) 85%, black);
    box-shadow: 0 4px 14px color-mix(in oklab, var(--error) 40%, transparent), var(--elevation-1);
    transform: translateY(-1px);
  }
  .rf-btn[data-variant="danger"]:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    box-shadow: var(--elevation-0);
  }

  /* Success */
  .rf-btn[data-variant="success"] {
    background: var(--ok);
    color: var(--bg-0);
    box-shadow: var(--elevation-1);
  }
  .rf-btn[data-variant="success"]:hover:not(:disabled) {
    background: color-mix(in oklab, var(--ok) 85%, black);
    box-shadow: 0 4px 14px color-mix(in oklab, var(--ok) 40%, transparent), var(--elevation-1);
    transform: translateY(-1px);
  }
  .rf-btn[data-variant="success"]:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
    box-shadow: var(--elevation-0);
  }

  /* Disabled */
  .rf-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none !important;
    filter: none !important;
    box-shadow: none !important;
  }

  /* Focus */
  .rf-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  /* Loading */
  .rf-btn__spinner {
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: rf-spin var(--motion-xl, 0.7s) linear infinite;
    flex-shrink: 0;
  }

  @keyframes rf-spin {
    to { transform: rotate(360deg); }
  }

  .rf-btn__label {
    display: contents;
  }
</style>
