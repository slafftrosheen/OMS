<script lang="ts">
  import { ui } from '$lib/state/ui';
  import { t } from 'svelte-i18n';
  import PanelTop from 'lucide-svelte/icons/panel-top';
  
  type DensityOption = 'compact' | 'cozy' | 'comfortable';
  type UiState = { theme: string; density: DensityOption; fontScale: number };
  
  let currentUi: UiState | undefined;
  ui.subscribe(v => currentUi = v as UiState);
  
  const opts: Array<{k: DensityOption; label: () => string}> = [
    {k:'compact',      label: () => $t('ui.density.compact','Compact')},
    {k:'cozy',         label: () => $t('ui.density.cozy','Cozy')},
    {k:'comfortable',  label: () => $t('ui.density.comfortable','Comfortable')}
  ];
  
  function set(k: DensityOption) {
    ui.update(p => ({...p, density: k}));
  }
</script>

<div class="menu density-menu">
  <button class="density-btn" aria-haspopup="menu" aria-expanded="false" title={$t('ui.density.title','Density')}>
    <PanelTop size={18} aria-hidden="true"/>
  </button>
  <div class="dropdown" role="menu">
    {#each opts as o}
      <button role="menuitem" class:active={currentUi?.density===o.k} on:click={()=>set(o.k)}>{o.label()}</button>
    {/each}
  </div>
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
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .density-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .dropdown button.active {
    background: var(--bg-2);
    font-weight: 600;
  }
</style>
