<script lang="ts">
  let { children, 
    tabs = [], 
    activeTab = $bindable(tabs[0]?.id || ''),
    onchange
  }: {
    children?: import('svelte').Snippet;
    tabs?: { id: string; label: string; icon?: any }[];
    activeTab?: string;
    onchange?: (data: { tab: string }) => void;
  } = $props();
  
  function selectTab(id: string) {
    activeTab = id;
    onchange?.({ tab: id });
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
        onclick={() => selectTab(tab.id)}
      >
        {#if tab.icon}
          <tab.icon size={16} />
        {/if}
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
  
  <div class="tab-content" role="tabpanel">
    {@render children?.()}
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
    border-bottom: 2px solid var(--border, var(--border));
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
    color: var(--muted, var(--ink-tertiary));
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    position: relative;
    margin-bottom: -2px;
  }

  .tab:hover {
    color: var(--text, var(--ink-primary));
    background: var(--bg-2, var(--bg-2));
  }

  .tab.active {
    color: var(--accent, var(--brand));
    border-bottom-color: var(--accent, var(--brand));
  }

  .tab:focus-visible {
    outline: 2px solid var(--focus, var(--brand));
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