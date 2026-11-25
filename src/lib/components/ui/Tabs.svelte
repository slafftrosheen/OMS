<script lang="ts">
  let { children, 
    tabs = [], 
    activeTab = $bindable(tabs[0]?.id || ''),
    label, onchange
  }: {
    children?: import('svelte').Snippet;
    tabs?: { id: string; label: string; icon?: any }[];
    activeTab?: string;
    label?: string;
    onchange?: (data: { tab: string }) => void;
  } = $props();
  
  const uid = $props.id();

  function navigate(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = index === last ? 0 : index + 1; break;
      case 'ArrowLeft': next = index === 0 ? last : index - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    event.preventDefault();
    selectTab(tabs[next].id);
    document.getElementById(`${uid}-${tabs[next].id}`)?.focus();
  }

  function selectTab(id: string) {
    activeTab = id;
    onchange?.({ tab: id });
  }
</script>

<div class="tabs-container">
  <div class="tabs-list" role="tablist" aria-label={label}>
    {#each tabs as tab, i (tab.id)}
      <button
        type="button"
        role="tab"
        id={`${uid}-${tab.id}`}
        aria-controls={`${uid}-panel`}
        tabindex={activeTab === tab.id ? 0 : -1}
        onkeydown={event => navigate(event, i)}
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
  
  <div class="tab-content" role="tabpanel" tabindex="0" id={`${uid}-panel`} aria-labelledby={`${uid}-${activeTab}`}>
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
    scroll-margin-block:var(--topbar-h,64px) var(--mobile-nav-h,68px);
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