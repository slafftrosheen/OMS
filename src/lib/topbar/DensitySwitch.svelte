<script lang="ts">
  import { ui } from '$lib/state/appState.svelte';
  import { t } from 'svelte-i18n';
  import { clickOutside } from '$lib/utils/click-outside';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  type Density = 'compact' | 'cozy' | 'comfortable';

  const options: { id: Density; icon: IconName; label: string }[] = [
    { id: 'compact',     icon: 'minimize', label: 'Compact' },
    { id: 'cozy',        icon: 'columns',  label: 'Cozy' },
    { id: 'comfortable', icon: 'maximize', label: 'Comfortable' },
  ];

  let isOpen = $state(false);
  let current = $derived(($ui).density as Density);
  let currentIcon = $derived(options.find(o => o.id === current)?.icon ?? 'columns');

  function set(density: Density) { ui.update(p => ({ ...p, density })); isOpen = false; }
</script>

<div class="rf-density" use:clickOutside={() => { isOpen = false; }}>
  <button
    class="rf-density__btn"
    type="button"
    aria-haspopup="menu"
    aria-expanded={isOpen}
    aria-label={$t('topbar.density', { default: 'Density' })}
    onclick={() => isOpen = !isOpen}
  >
    <Icon name={currentIcon} size="sm" />
  </button>

  {#if isOpen}
    <div class="rf-density__dropdown" role="menu">
      {#each options as opt}
        <button
          role="menuitem"
          class="rf-density__item"
          class:active={current === opt.id}
          type="button"
          onclick={() => set(opt.id)}
        >
          <Icon name={opt.icon} size="sm" />
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rf-density { position: relative; }

  .rf-density__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--control-sm, 36px);
    height: var(--control-sm, 36px);
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
  }
  .rf-density__btn:hover,
  .rf-density__btn[aria-expanded="true"] {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
  }
  .rf-density__btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .rf-density__dropdown {
    position: absolute;
    top: calc(100% + var(--space-sm));
    right: 0;
    min-width: 160px;
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-md);
    padding: var(--space-xxs);
    z-index: var(--z-popover);
    animation: rf-dd-in var(--motion-sm) var(--ease-standard) both;
  }

  :global(.rf-bottombar) .rf-density__dropdown {
    top: auto;
    bottom: calc(100% + var(--space-sm));
    animation: rf-dd-up var(--motion-sm) var(--ease-standard) both;
  }

  @keyframes rf-dd-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }
  @keyframes rf-dd-up {
    from { opacity: 0; transform: translateY(6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .rf-density__item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    cursor: pointer;
    text-align: left;
    font-size: var(--text-sm);
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
  }
  .rf-density__item:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); color: var(--ink-primary); }
  .rf-density__item:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
  .rf-density__item.active {
    background: var(--brand);
    color: white;
    font-weight: 600;
  }
  .rf-density__item.active:hover { background: color-mix(in oklab, var(--brand) 85%, black); }
</style>
