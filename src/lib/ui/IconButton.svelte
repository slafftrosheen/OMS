<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName, IconSize } from './icons';

  type Variant = 'ghost' | 'glass' | 'secondary' | 'danger';
  type Size = 'xs' | 'sm' | 'md' | 'lg';

  const sizeMap: Record<Size, { box: string; icon: IconSize }> = {
    xs: { box: 'var(--control-xs, 24px)',  icon: 'xs' },
    sm: { box: 'var(--control-xs, 28px)',  icon: 'sm' },
    md: { box: 'var(--control-sm, 36px)',  icon: 'sm' },
    lg: { box: 'var(--control-md, 44px)',  icon: 'md' },
  };

  let {
    name,
    size = 'md',
    variant = 'ghost',
    label,
    disabled = false,
    type = 'button',
    onclick,
    class: className = ''
  }: {
    name: IconName;
    size?: Size;
    variant?: Variant;
    label?: string;
    disabled?: boolean;
    type?: 'button' | 'submit';
    onclick?: (e: MouseEvent) => void;
    class?: string;
  } = $props();

  const resolved = $derived(sizeMap[size]);
</script>

<button
  {type}
  {disabled}
  aria-label={label}
  class={['rf-icon-btn', className].filter(Boolean).join(' ')}
  data-variant={variant}
  style="--_box:{resolved.box}"
  {onclick}
>
  <Icon name={name} size={resolved.icon} />
</button>

<style>
  .rf-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--_box);
    height: var(--_box);
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background   var(--motion-sm) var(--ease-standard),
      color        var(--motion-sm) var(--ease-standard),
      border-color var(--motion-sm) var(--ease-standard),
      box-shadow   var(--motion-sm) var(--ease-standard),
      transform    var(--motion-xs) var(--ease-emphasized);
    -webkit-tap-highlight-color: transparent;
  }

  /* Ghost */
  .rf-icon-btn[data-variant="ghost"] {
    background: transparent;
    color: var(--ink-secondary);
  }
  .rf-icon-btn[data-variant="ghost"]:hover:not(:disabled) {
    background: var(--bg-2);
    color: var(--ink-primary);
  }

  /* Glass */
  .rf-icon-btn[data-variant="glass"] {
    background: var(--glass-tint-bg);
    color: var(--ink-secondary);
    border-color: var(--glass-border);
    backdrop-filter: var(--glass-material-regular);
    -webkit-backdrop-filter: var(--glass-material-regular);
  }
  .rf-icon-btn[data-variant="glass"]:hover:not(:disabled) {
    background: var(--glass-tint-hover);
    color: var(--ink-primary);
    box-shadow: var(--glass-shadow-sm);
  }

  /* Secondary */
  .rf-icon-btn[data-variant="secondary"] {
    background: var(--bg-1);
    color: var(--ink-secondary);
    border-color: var(--border);
    box-shadow: var(--elevation-1);
  }
  .rf-icon-btn[data-variant="secondary"]:hover:not(:disabled) {
    background: var(--bg-2);
    border-color: color-mix(in oklab, var(--border) 50%, var(--text));
    box-shadow: var(--elevation-2);
  }

  /* Danger */
  .rf-icon-btn[data-variant="danger"] {
    background: transparent;
    color: var(--ink-tertiary);
  }
  .rf-icon-btn[data-variant="danger"]:hover:not(:disabled) {
    background: var(--error-soft);
    color: var(--error);
  }

  /* Active */
  .rf-icon-btn:active:not(:disabled) {
    transform: scale(0.9);
  }

  /* Focus */
  .rf-icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  /* Disabled */
  .rf-icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
