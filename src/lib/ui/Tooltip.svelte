<script lang="ts">
  import { HelpCircle } from 'lucide-svelte';
  import { onDestroy } from 'svelte';
  import { ui } from '$lib/state/ui';
  
  export let text: string = '';
  export let position: 'top' | 'bottom' | 'left' | 'right' = 'top';
  
  let showTooltip = false;
  let timeoutId: number;
  let fontScale = 1;
  const tooltipId = `tooltip-${Math.random().toString(36).slice(2)}`;
  const unsubscribe = ui.subscribe((prefs) => {
    fontScale = prefs.fontScale;
  });
  onDestroy(unsubscribe);
  $: iconSize = 18 * fontScale;
  
  function handleMouseEnter() {
    timeoutId = window.setTimeout(() => {
      showTooltip = true;
    }, 500);
  }
  
  function handleMouseLeave() {
    clearTimeout(timeoutId);
    showTooltip = false;
  }
</script>

<span class="tooltip-wrapper">
  <button
    type="button"
    class="tooltip-trigger"
    aria-describedby={tooltipId}
    on:mouseenter={handleMouseEnter}
    on:mouseleave={handleMouseLeave}
    on:focus={handleMouseEnter}
    on:blur={handleMouseLeave}
  >
    <HelpCircle size={iconSize} class="tooltip-icon" aria-hidden="true" />
    <span class="sr-only">{text}</span>
  </button>
  {#if showTooltip}
    <span
      id={tooltipId}
      class="tooltip-content"
      data-position={position}
      class:show={showTooltip}
      role="tooltip"
    >
      {text}
    </span>
  {/if}
</span>

<style>
  .tooltip-wrapper {
    display: inline-flex;
    position: relative;
  }

  .tooltip-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: var(--space-xxs);
    background: transparent;
    color: var(--muted);
    cursor: help;
    transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
  }

  .tooltip-trigger:hover,
  .tooltip-trigger:focus-visible {
    color: var(--accent-1);
    border-color: color-mix(in oklab, var(--accent-1) 30%, transparent);
    background-color: color-mix(in oklab, var(--bg-1) 65%, transparent);
    outline: none;
  }

  :global(.tooltip-icon) {
    flex-shrink: 0;
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .tooltip-content {
    position: absolute;
    z-index: 1000;
    padding: calc(var(--space-xs) + var(--space-xxs)) calc(var(--space-sm) + var(--space-xxs));
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 28px rgba(var(--shadow-rgb)/.18);
    font-size: 0.9rem;
    line-height: 1.4;
    max-inline-size: min(32ch, 18rem);
    white-space: normal;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .tooltip-content.show {
    opacity: 1;
  }

  .tooltip-content[data-position="top"] {
    bottom: calc(100% + var(--space-xs));
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-content[data-position="bottom"] {
    top: calc(100% + var(--space-xs));
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-content[data-position="left"] {
    right: calc(100% + var(--space-xs));
    top: 50%;
    transform: translateY(-50%);
  }

  .tooltip-content[data-position="right"] {
    left: calc(100% + var(--space-xs));
    top: 50%;
    transform: translateY(-50%);
  }
</style>
