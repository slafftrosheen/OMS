<script lang="ts">
  import { tick } from 'svelte';
  import { trap } from '$lib/a11y/focus-trap';

  export let open = false;
  export let title = '';
  export let onClose: () => void = () => {};
  let panel: HTMLDivElement | null = null;
  let previouslyFocused: HTMLElement | null = null;

  function backdrop(e: MouseEvent){ if(e.target === e.currentTarget) onClose(); }
  function backdropKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  }

  $: if (open) {
    if (typeof document !== 'undefined') {
      previouslyFocused = document.activeElement as HTMLElement | null;
      tick().then(() => {
        if (!panel) return;
        const focusTarget = panel.querySelector<HTMLElement>(
          '[autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        focusTarget?.focus();
      });
    }
  } else if (previouslyFocused) {
    previouslyFocused.focus?.();
    previouslyFocused = null;
  }
</script>

{#if open}
  <div class="shade" role="button" tabindex="0" on:click={backdrop} on:keydown={backdropKey}>
    <div
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      bind:this={panel}
      use:trap
    >
      <header><h3>{title}</h3><button class="x" on:click={onClose} aria-label="Close">✕</button></header>
      <section><slot /></section>
      <footer><slot name="footer" /></footer>
    </div>
  </div>
{/if}

<style>
  .shade {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: grid;
    place-items: center;
    z-index: 99;
  }
  .panel {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 14px;
    min-width: 360px;
    max-width: 640px;
    padding: 14px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .x {
    background: transparent;
    border: none;
    color: var(--text);
    cursor: pointer;
    font-size: 1.1rem;
  }
  footer {
    margin-top: 10px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
</style>
