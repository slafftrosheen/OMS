<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { modalDialog } from './modal-dialog';
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

  const dialogId = $props.id();
</script>

{#if open}
  <dialog
    class="rf-modal"
    transition:fade={{ duration: 180 }}
    use:modalDialog={{ onClose, closeOnBackdrop }}
    aria-labelledby={title && !header ? dialogId : undefined}
    aria-label={title && !header ? undefined : title || 'Dialog'}
  >
    <div class="rf-modal__panel" data-size={size}
      transition:scale={{ duration: 220, start: 0.96 }}>
      <header class="rf-modal__header">
        {#if header}
          {@render header()}
        {:else if title}
          <h3 id={dialogId} class="rf-modal__title">{title}</h3>
        {/if}
        <button type="button" class="rf-modal__close" onclick={onClose} aria-label="Close">
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
  </dialog>
{/if}

<style>
  .rf-modal:not([open]) { display:none; }
  .rf-modal::backdrop { background:transparent; }
  .rf-modal {
    margin: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border: 0;
    color: inherit;
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
    position: relative;
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
    isolation: isolate;
  }
  /* Q15a: subtle grain overlay on every elevated surface for the 2026 Apple feel. */
  .rf-modal__panel::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    opacity: var(--grain-opacity, 0.04);
    background-image: var(--grain-svg, none);
    background-size: 240px 240px;
    mix-blend-mode: var(--grain-blend-mode, overlay);
    z-index: 0;
  }
  .rf-modal__panel > * { position: relative; z-index: 1; }

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
