<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let tabs: { id: string; label: string; icon?: any }[] = [];
  export let activeTab: string = tabs[0]?.id || '';
  
  const dispatch = createEventDispatcher();
  
  function selectTab(id: string) {
    activeTab = id;
    dispatch('change', { tab: id });
  }
</script>

<div class="tabs-container">
  <div class="tabs-list" role="tablist">
    {#each tabs as tab}
      <button
        role="tab"
        aria-selected={activeTab === tab.id}
        class="tab"
        class:active={activeTab === tab.id}
        on:click={() => selectTab(tab.id)}
      >
        {#if tab.icon}
          <svelte:component this={tab.icon} size={16} />
        {/if}
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
  
  <div class="tab-content" role="tabpanel">
    <slot />
  </div>
</div>

<style>
  .tabs-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg, 16px);
    width: 100%;
  }

  .tabs-list {
    display: flex;
    gap: var(--space-xs, 4px);
    border-bottom: 2px solid var(--border, #e5e7eb);
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-md, 12px) var(--space-lg, 16px);
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--muted, #6b7280);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
    position: relative;
    margin-bottom: -2px;
  }

  .tab:hover {
    color: var(--text, #111827);
    background: var(--bg-2, #f3f4f6);
  }

  .tab.active {
    color: var(--accent, #ff6b35);
    border-bottom-color: var(--accent, #ff6b35);
  }

  .tab:focus-visible {
    outline: 2px solid var(--focus, #3b82f6);
    outline-offset: 2px;
    border-radius: var(--radius-sm, 4px);
  }

  .tab-content {
    min-height: 200px;
  }

  @media (max-width: 640px) {
    .tabs-list {
      gap: 2px;
    }

    .tab {
      padding: var(--space-sm, 8px) var(--space-md, 12px);
      font-size: 0.8125rem;
    }
  }
</style>