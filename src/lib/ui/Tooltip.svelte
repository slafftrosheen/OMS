<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    text?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    trigger?: Snippet;
  }

  let { text = '', position = 'top', trigger }: Props = $props();

  let visible = $state(false);
  let timeoutId: ReturnType<typeof setTimeout>;
  const tooltipId = `rf-tooltip-${Math.random().toString(36).slice(2)}`;

  function show() {
    timeoutId = setTimeout(() => { visible = true; }, 400);
  }
  function hide() {
    clearTimeout(timeoutId);
    visible = false;
  }
</script>

<span class="rf-tooltip-wrap">
  <button
    type="button"
    class="rf-tooltip-trigger"
    aria-describedby={visible ? tooltipId : undefined}
    onmouseenter={show}
    onmouseleave={hide}
    onfocus={show}
    onblur={hide}
  >
    {#if trigger}
      {@render trigger()}
    {:else}
      <Icon name="help-circle" size="sm" label={text} />
    {/if}
  </button>

  {#if visible}
    <span
      id={tooltipId}
      class="rf-tooltip"
      data-position={position}
      role="tooltip"
    >
      {text}
    </span>
  {/if}
</span>

<style>
  .rf-tooltip-wrap {
    display: inline-flex;
    position: relative;
  }

  .rf-tooltip-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-full);
    padding: var(--space-xxs);
    background: transparent;
    color: var(--ink-tertiary);
    cursor: help;
    transition:
      color        var(--motion-sm) var(--ease-standard),
      background   var(--motion-sm) var(--ease-standard);
  }
  .rf-tooltip-trigger:hover,
  .rf-tooltip-trigger:focus-visible {
    color: var(--brand);
    background: var(--brand-soft);
    outline: none;
  }
  .rf-tooltip-trigger:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .rf-tooltip {
    position: absolute;
    z-index: var(--z-tooltip);
    padding: var(--space-xs) var(--space-sm);
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--glass-shadow-md);
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: var(--leading-snug);
    color: var(--ink-primary);
    max-inline-size: min(28ch, 16rem);
    white-space: normal;
    pointer-events: none;
    animation: rf-tooltip-in var(--motion-sm) var(--ease-standard) both;
  }

  @keyframes rf-tooltip-in {
    from { opacity: 0; transform: var(--_enter-tx, translateX(-50%)) translateY(4px) scale(0.96); }
    to   { opacity: 1; transform: var(--_enter-tx, translateX(-50%)) translateY(0)  scale(1); }
  }

  .rf-tooltip[data-position="top"] {
    --_enter-tx: translateX(-50%);
    bottom: calc(100% + var(--space-xs));
    left: 50%;
    transform: translateX(-50%);
  }
  .rf-tooltip[data-position="bottom"] {
    --_enter-tx: translateX(-50%);
    top: calc(100% + var(--space-xs));
    left: 50%;
    transform: translateX(-50%);
  }
  .rf-tooltip[data-position="left"] {
    --_enter-tx: translateY(-50%);
    right: calc(100% + var(--space-xs));
    top: 50%;
    transform: translateY(-50%);
  }
  .rf-tooltip[data-position="right"] {
    --_enter-tx: translateY(-50%);
    left: calc(100% + var(--space-xs));
    top: 50%;
    transform: translateY(-50%);
  }
</style>
