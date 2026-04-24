<script lang="ts">
  import { ui } from '$lib/state/appState.svelte';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';

  let fontScale = $derived(($ui).fontScale);
  let percentage = $derived(Math.round(fontScale * 100));

  function decrease() {
    const s = Math.max(0.85, fontScale - 0.05);
    ui.update(p => ({ ...p, fontScale: Math.round(s * 100) / 100 }));
  }
  function increase() {
    const s = Math.min(1.3, fontScale + 0.05);
    ui.update(p => ({ ...p, fontScale: Math.round(s * 100) / 100 }));
  }
  function reset() { ui.update(p => ({ ...p, fontScale: 1.0 })); }
</script>

<div class="rf-textsize" role="group" aria-label={$t('topbar.textSize', { default: 'Text Size' })}>
  <button
    class="rf-textsize__btn"
    type="button"
    onclick={decrease}
    disabled={fontScale <= 0.85}
    aria-label={$t('topbar.decreaseTextSize', { default: 'Decrease text size' })}
  >
    <Icon name="minus-circle" size="xs" />
  </button>

  <button
    class="rf-textsize__display"
    type="button"
    onclick={reset}
    aria-label={$t('topbar.resetTextSize', { default: 'Reset text size to 100%' })}
    title="Reset to 100%"
  >
    {percentage}%
  </button>

  <button
    class="rf-textsize__btn"
    type="button"
    onclick={increase}
    disabled={fontScale >= 1.3}
    aria-label={$t('topbar.increaseTextSize', { default: 'Increase text size' })}
  >
    <Icon name="plus-circle" size="xs" />
  </button>
</div>

<style>
  .rf-textsize {
    display: flex;
    align-items: center;
    gap: 1px;
    background: color-mix(in oklab, var(--bg-1) 55%, var(--bg-0));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px;
    height: var(--control-sm, 36px);
  }

  .rf-textsize__btn,
  .rf-textsize__display {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    padding: 0 var(--space-xs);
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-sm) - 2px);
    color: var(--ink-secondary);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
  }
  .rf-textsize__btn:hover:not(:disabled),
  .rf-textsize__display:hover {
    background: var(--bg-2);
    color: var(--ink-primary);
  }
  .rf-textsize__btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .rf-textsize__btn:focus-visible,
  .rf-textsize__display:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .rf-textsize__display {
    min-width: 44px;
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--ink-primary);
    font-variant-numeric: tabular-nums;
  }
</style>
