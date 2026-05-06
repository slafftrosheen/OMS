<!-- src/lib/components/ui/Button.svelte — 2026 -->
<script lang="ts">
  let {
    children,
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
    if (!disabled && !loading) onclick?.(event);
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
    gap: var(--space-sm);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    cursor: pointer;
    font-family: inherit;
    line-height: 1.2;
    text-decoration: none;
    white-space: nowrap;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    transition:
      transform   var(--motion-sm) var(--ease-spring-soft),
      filter      var(--motion-sm) var(--ease-standard),
      background  var(--motion-sm) var(--ease-standard),
      color       var(--motion-sm) var(--ease-standard),
      box-shadow  var(--motion-sm) var(--ease-standard);
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .btn:not(:disabled):active { transform: scale(0.97); }

  /* Sizes (use scale-aware tokens) */
  .btn-sm {
    height: var(--control-sm);
    padding: 0 var(--space-md);
    font-size: var(--text-sm);
  }
  .btn-md {
    height: var(--control-size);
    padding: 0 var(--space-lg);
    font-size: var(--text-md);
  }
  .btn-lg {
    height: calc(var(--control-size) + 8px);
    padding: 0 var(--space-xl);
    font-size: var(--text-md);
  }

  /* Primary — brand fill with subtle gradient + glow */
  .btn-primary {
    background:
      linear-gradient(180deg,
        color-mix(in oklab, var(--brand) 96%, white) 0%,
        var(--brand) 100%);
    color: #ffffff;
    box-shadow:
      0 4px 14px -2px color-mix(in oklab, var(--brand) 35%, transparent),
      inset 0 1px 0 color-mix(in oklab, white 22%, transparent);
  }
  .btn-primary:not(:disabled):hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
    box-shadow:
      0 8px 22px -4px color-mix(in oklab, var(--brand) 45%, transparent),
      inset 0 1px 0 color-mix(in oklab, white 30%, transparent);
  }

  /* Secondary — neutral glass surface */
  .btn-secondary {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    color: var(--ink-primary);
    border-color: var(--border);
  }
  .btn-secondary:not(:disabled):hover {
    background: var(--bg-2);
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }

  /* Danger */
  .btn-danger {
    background:
      linear-gradient(180deg,
        color-mix(in oklab, var(--error) 96%, white) 0%,
        var(--error) 100%);
    color: #ffffff;
    box-shadow:
      0 4px 14px -2px color-mix(in oklab, var(--error) 35%, transparent),
      inset 0 1px 0 color-mix(in oklab, white 22%, transparent);
  }
  .btn-danger:not(:disabled):hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  /* Ghost */
  .btn-ghost {
    background: transparent;
    color: var(--ink-secondary);
  }
  .btn-ghost:not(:disabled):hover {
    background: color-mix(in oklab, var(--bg-2) 80%, transparent);
    color: var(--ink-primary);
  }

  /* Outline */
  .btn-outline {
    background: transparent;
    color: var(--brand);
    border-color: color-mix(in oklab, var(--brand) 50%, transparent);
  }
  .btn-outline:not(:disabled):hover {
    background: var(--brand-soft);
    border-color: var(--brand);
    transform: translateY(-1px);
  }

  /* States */
  .btn-disabled, .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
    filter: none !important;
  }

  .btn-loading { color: transparent; pointer-events: none; }

  .btn-full { width: 100%; }

  /* Spinner */
  .btn-spinner {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: btn-spin 0.7s linear infinite;
    color: var(--ink-primary);
  }
  .btn-primary .btn-spinner,
  .btn-danger .btn-spinner { color: white; }

  @keyframes btn-spin { to { transform: rotate(360deg); } }

  .btn-icon {
    display: inline-flex;
    align-items: center;
    font-size: 1.1em;
  }
</style>
