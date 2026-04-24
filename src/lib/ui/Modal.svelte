<script lang="ts">
  import { tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { trap } from '$lib/a11y/focus-trap';
  import Icon from './Icon.svelte';

  type Size = 'sm' | 'md' | 'lg' | 'xl' | 'full';

  interface Props {
    open?: boolean;
    title?: string;
    size?: Size;
    closeOnBackdrop?: boolean;
    onClose?: () => void;
    children?: import('svelte').Snippet;
    footer?: import('svelte').Snippet;
    header?: import('svelte').Snippet;
  }

  let {
    open = false,
    title = '',
    size = 'md',
    closeOnBackdrop = true,
    onClose = () => {},
    children,
    footer,
    header
  }: Props = $props();

  let panel: HTMLDivElement | null = $state(null);
  let previouslyFocused: HTMLElement | null = null;

  function backdrop(e: MouseEvent) {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose();
  }
  function backdropKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }
  function keyHandler(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) { e.preventDefault(); onClose(); }
  }

  $effect(() => {
    if (open) {
      if (typeof document !== 'undefined') {
        previouslyFocused = document.activeElement as HTMLElement | null;
        document.addEventListener('keydown', keyHandler);
        tick().then(() => {
          if (!panel) return;
          const target = panel.querySelector<HTMLElement>(
            '[autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          target?.focus();
        });
        return () => document.removeEventListener('keydown', keyHandler);
      }
    } else if (previouslyFocused) {
      previouslyFocused.focus?.();
      previouslyFocused = null;
    }
  });
</script>

{#if open}
  <div
    class="rf-modal"
    role="presentation"
    transition:fade={{ duration: 180 }}
    onclick={backdrop}
    onkeydown={backdropKey}
  >
    <div
      class="rf-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'rf-modal-title' : undefined}
      data-size={size}
      bind:this={panel}
      use:trap
      transition:scale={{ duration: 220, start: 0.96 }}
    >
      <header class="rf-modal__header">
        {#if header}
          {@render header()}
        {:else if title}
          <h3 id="rf-modal-title" class="rf-modal__title">{title}</h3>
        {/if}
        <button class="rf-modal__close" onclick={onClose} aria-label="Close">
          <Icon name="x" size="sm" />
        </button>
      </header>

      <section class="rf-modal__body">
        {@render children?.()}
      </section>

      {#if footer}
        <footer class="rf-modal__footer">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .rf-modal {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-lg);
    z-index: var(--z-modal);
    background: color-mix(in oklab, var(--bg-0) 45%, transparent);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
  }

  .rf-modal__panel {
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-lg), var(--glass-border-highlight);
    width: min(100%, var(--panel-max, 560px));
    max-height: calc(100vh - 2 * var(--space-lg));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .rf-modal__panel[data-size="sm"]   { --panel-max: 400px; }
  .rf-modal__panel[data-size="md"]   { --panel-max: 560px; }
  .rf-modal__panel[data-size="lg"]   { --panel-max: 760px; }
  .rf-modal__panel[data-size="xl"]   { --panel-max: 960px; }
  .rf-modal__panel[data-size="full"] { --panel-max: 100%; max-height: 100%; height: 100%; border-radius: 0; }

  .rf-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--divider);
  }

  .rf-modal__title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    color: var(--ink-primary);
  }

  .rf-modal__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-sm);
    height: var(--control-sm);
    border-radius: var(--radius-full);
    background: transparent;
    border: 1px solid transparent;
    color: var(--muted);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    box-shadow: none;
  }
  .rf-modal__close:hover { background: var(--bg-2); color: var(--text); transform: none; filter: none; }

  .rf-modal__body {
    padding: var(--space-lg);
    overflow-y: auto;
  }

  .rf-modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--divider);
    background: color-mix(in oklab, var(--bg-0) 40%, transparent);
  }
</style>
