<script lang="ts">
  import { Minimize2, Maximize2, Columns } from 'lucide-svelte';
  import { ui } from '$lib/state/appState';
  import { t } from 'svelte-i18n';
  import { clickOutside } from '$lib/utils/click-outside';

  type Density = 'compact' | 'cozy' | 'comfortable';
  
  let isOpen = $state(false);
  let current = $derived(($ui).density as Density);

  function set(density: Density) {
    ui.update(p => ({ ...p, density }));
    isOpen = false;
  }

  function toggle() {
    isOpen = !isOpen;
  }

  function handleClickOutside() {
    isOpen = false;
  }

  const options: { id: Density; icon: any; label: string }[] = [
    { id: 'compact', icon: Minimize2, label: 'Compact' },
    { id: 'cozy', icon: Columns, label: 'Cozy' },
    { id: 'comfortable', icon: Maximize2, label: 'Comfortable' }
  ];

  let currentIcon = $derived(options.find(o => o.id === current)?.icon || Columns);

  const SvelteComponent = $derived(currentIcon);
</script>

<div class="density-menu" use:clickOutside={handleClickOutside}>
  <button 
    class="density-btn"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    aria-label={$t('topbar.density', { default: 'Density' })}
  >
    <SvelteComponent size={18} aria-hidden="true" />
  </button>
  
  {#if isOpen}
    <div class="dropdown" role="menu">
      {#each options as option}
        <button
          role="menuitem"
          class:active={current === option.id}
          onclick={() => set(option.id)}
        >
          <option.icon size={16} />
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .density-menu {
    position: relative;
  }

  .density-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .density-btn:hover,
  .density-btn[aria-expanded="true"] {
    background: var(--bg-2);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 160px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(var(--shadow-rgb, 0 0 0) / 0.18);
    padding: 4px;
    z-index: 10000;
    animation: slideDown 0.15s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
    font-size: 0.875rem;
  }

  .dropdown button:hover {
    background: var(--bg-2);
  }

  .dropdown button.active {
    background: var(--accent-1, var(--accent));
    color: white;
    font-weight: 600;
  }
</style>
