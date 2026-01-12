<script lang="ts">
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Contrast from 'lucide-svelte/icons/contrast';
  import Monitor from 'lucide-svelte/icons/monitor';
  import { ui } from '$lib/state/ui';
  import { t } from 'svelte-i18n';

  type Theme = 'LightVim' | 'DarkVim' | 'HighContrastVim';
  
  let currentTheme: Theme = 'DarkVim';
  ui.subscribe(p => currentTheme = p.theme as Theme);

  function set(theme: Theme) {
    ui.update(p => ({ ...p, theme }));
  }

  const themes: { id: Theme; icon: any; label: string }[] = [
    { id: 'LightVim', icon: Sun, label: 'Light' },
    { id: 'DarkVim', icon: Moon, label: 'Dark' },
    { id: 'HighContrastVim', icon: Contrast, label: 'High Contrast' }
  ];

  $: currentIcon = themes.find(t => t.id === currentTheme)?.icon || Moon;
</script>

<div class="menu theme-menu">
  <button class="theme-btn" aria-haspopup="menu" aria-expanded="false" aria-label={$t('topbar.theme', { default: 'Theme' })}>
    <svelte:component this={currentIcon} size={18} aria-hidden="true" />
  </button>
  <div class="dropdown" role="menu">
    {#each themes as theme}
      <button 
        role="menuitem" 
        class:active={currentTheme === theme.id}
        on:click={() => set(theme.id)}
      >
        <svelte:component this={theme.icon} size={16} />
        <span>{theme.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .theme-menu {
    position: relative;
  }

  .theme-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .theme-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .dropdown button {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dropdown button.active {
    background: var(--bg-2);
    font-weight: 600;
  }
</style>
