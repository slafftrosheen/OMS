<script lang="ts">
  import { MinusCircle, PlusCircle } from 'lucide-svelte';
  import { ui } from '$lib/state/appState.svelte';
  import { t } from 'svelte-i18n';

  let fontScale = $derived(($ui).fontScale);

  function decrease() {
    const newScale = Math.max(0.85, fontScale - 0.05);
    ui.update(p => ({ ...p, fontScale: Math.round(newScale * 100) / 100 }));
  }

  function increase() {
    const newScale = Math.min(1.3, fontScale + 0.05);
    ui.update(p => ({ ...p, fontScale: Math.round(newScale * 100) / 100 }));
  }

  function reset() {
    ui.update(p => ({ ...p, fontScale: 1.0 }));
  }

  let percentage = $derived(Math.round(fontScale * 100));
</script>

<div class="text-size-group">
  <button
    class="size-btn"
    onclick={decrease}
    disabled={fontScale <= 0.85}
    aria-label={$t('topbar.decreaseTextSize', { default: 'Decrease text size' })}
    title="Decrease text size"
  >
    <MinusCircle size={16} />
  </button>
  
  <button
    class="size-display"
    onclick={reset}
    aria-label={$t('topbar.resetTextSize', { default: 'Reset text size' })}
    title="Reset to 100%"
  >
    <span>{percentage}%</span>
  </button>
  
  <button
    class="size-btn"
    onclick={increase}
    disabled={fontScale >= 1.3}
    aria-label={$t('topbar.increaseTextSize', { default: 'Increase text size' })}
    title="Increase text size"
  >
    <PlusCircle size={16} />
  </button>
</div>

<style>
  .text-size-group {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 2px;
    height: 36px;
  }

  .size-btn,
  .size-display {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    padding: 0 8px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
  }

  .size-btn:hover:not(:disabled) {
    background: var(--bg-2);
  }

  .size-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .size-display {
    min-width: 48px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .size-display:hover {
    background: var(--bg-2);
  }
</style>
