<script lang="ts">
  import { ui } from '$lib/state/appState.svelte';
  import { t } from 'svelte-i18n';
  import { clickOutside } from '$lib/utils/click-outside';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  type Theme = 'LightVim' | 'DarkVim' | 'HighContrastVim';

  const themes: { id: Theme; icon: IconName; label: string }[] = [
    { id: 'LightVim',        icon: 'sun',      label: 'Light' },
    { id: 'DarkVim',         icon: 'moon',     label: 'Dark' },
    { id: 'HighContrastVim', icon: 'contrast', label: 'High Contrast' },
  ];

  let isOpen = $state(false);
  let currentTheme = $derived(($ui).theme as Theme);
  let currentIcon = $derived(themes.find(th => th.id === currentTheme)?.icon ?? 'moon');

  function set(theme: Theme) { ui.update(p => ({ ...p, theme })); isOpen = false; }
</script>

<div class="rf-theme" use:clickOutside={() => { isOpen = false; }}>
  <button
    class="rf-theme__btn"
    type="button"
    onclick={() => isOpen = !isOpen}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    aria-label={$t('topbar.theme', { default: 'Theme' })}
  >
    <Icon name={currentIcon} size="sm" />
  </button>

  {#if isOpen}
    <div class="rf-theme__dropdown" role="menu">
      {#each themes as th}
        <button
          role="menuitem"
          class="rf-theme__item"
          class:active={currentTheme === th.id}
          type="button"
          onclick={() => set(th.id)}
        >
          <Icon name={th.icon} size="sm" />
          <span>{th.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rf-theme { position: relative; }

  .rf-theme__btn {
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
  .rf-theme__btn:hover,
  .rf-theme__btn[aria-expanded="true"] {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
  }
  .rf-theme__btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .rf-theme__dropdown {
    position: absolute;
    top: calc(100% + var(--space-sm));
    right: 0;
    min-width: 180px;
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
  @keyframes rf-dd-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .rf-theme__item {
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
  .rf-theme__item:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); color: var(--ink-primary); }
  .rf-theme__item:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
  .rf-theme__item.active {
    background: var(--brand);
    color: var(--bg-0);
    font-weight: 600;
  }
  .rf-theme__item.active:hover { background: color-mix(in oklab, var(--brand) 85%, black); }
</style>
