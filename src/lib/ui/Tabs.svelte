<script lang="ts">
  import type { Snippet } from 'svelte';

  type Tab = { id: string; label: string; icon?: string; badge?: string | number };

  let {
    tabs = [],
    active = $bindable(tabs[0]?.id ?? ''),
    variant = 'underline',
    onChange = () => {}
  }: {
    tabs?: Tab[];
    active?: string;
    variant?: 'underline' | 'pill' | 'glass';
    onChange?: (id: string) => void;
  } = $props();

  let buttons: (HTMLButtonElement | undefined)[] = $state([]);

  function select(id: string) {
    active = id;
    onChange(id);
    const idx = tabs.findIndex(t => t.id === id);
    buttons[idx]?.focus();
  }

  function onKey(e: KeyboardEvent, idx: number) {
    const { key } = e;
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(key)) return;
    e.preventDefault();
    let next = idx;
    if (key === 'ArrowRight') next = Math.min(idx + 1, tabs.length - 1);
    if (key === 'ArrowLeft')  next = Math.max(idx - 1, 0);
    if (key === 'Home') next = 0;
    if (key === 'End')  next = tabs.length - 1;
    if (next !== idx && tabs[next]) select(tabs[next].id);
  }
</script>

<div role="tablist" class="rf-tabs" data-variant={variant}>
  {#each tabs as t, i}
    <button
      role="tab"
      type="button"
      class="rf-tabs__tab"
      aria-selected={active === t.id}
      tabindex={active === t.id ? 0 : -1}
      onclick={() => select(t.id)}
      onkeydown={(e) => onKey(e, i)}
      bind:this={buttons[i]}
    >
      {t.label}
      {#if t.badge !== undefined}
        <span class="rf-tabs__badge">{t.badge}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .rf-tabs {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xxs);
  }

  /* === Underline variant === */
  .rf-tabs[data-variant="underline"] {
    border-bottom: 1px solid var(--divider);
    width: 100%;
    gap: 0;
  }
  .rf-tabs[data-variant="underline"] .rf-tabs__tab {
    padding: var(--space-sm) var(--space-md);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--ink-secondary);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    margin-bottom: -1px;
    cursor: pointer;
    transition:
      color        var(--motion-sm) var(--ease-standard),
      border-color var(--motion-sm) var(--ease-standard);
  }
  .rf-tabs[data-variant="underline"] .rf-tabs__tab:hover {
    color: var(--ink-primary);
  }
  .rf-tabs[data-variant="underline"] .rf-tabs__tab[aria-selected="true"] {
    color: var(--brand);
    border-bottom-color: var(--brand);
    font-weight: 600;
  }

  /* === Pill variant === */
  .rf-tabs[data-variant="pill"] {
    background: var(--bg-2);
    border-radius: var(--radius-full);
    padding: 3px;
  }
  .rf-tabs[data-variant="pill"] .rf-tabs__tab {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--ink-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      box-shadow var(--motion-sm) var(--ease-standard);
  }
  .rf-tabs[data-variant="pill"] .rf-tabs__tab:hover {
    color: var(--ink-primary);
  }
  .rf-tabs[data-variant="pill"] .rf-tabs__tab[aria-selected="true"] {
    background: var(--bg-0);
    color: var(--ink-primary);
    font-weight: 600;
    box-shadow: var(--elevation-1);
  }

  /* === Glass variant === */
  .rf-tabs[data-variant="glass"] {
    background: var(--glass-tint-bg);
    backdrop-filter: var(--glass-material-regular);
    -webkit-backdrop-filter: var(--glass-material-regular);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    padding: 3px;
  }
  .rf-tabs[data-variant="glass"] .rf-tabs__tab {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--ink-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      box-shadow var(--motion-sm) var(--ease-standard);
  }
  .rf-tabs[data-variant="glass"] .rf-tabs__tab:hover {
    color: var(--ink-primary);
  }
  .rf-tabs[data-variant="glass"] .rf-tabs__tab[aria-selected="true"] {
    background: var(--glass-bg-strong);
    color: var(--ink-primary);
    font-weight: 600;
    box-shadow: var(--glass-shadow-sm);
  }

  /* Focus */
  .rf-tabs__tab:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  /* Badge */
  .rf-tabs__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 var(--space-xxs);
    background: color-mix(in oklab, var(--brand) 15%, transparent);
    color: var(--brand);
    border-radius: var(--radius-full);
    font-size: calc(var(--text-xs) - 1px);
    font-weight: 700;
    margin-left: var(--space-xxs);
  }
  .rf-tabs__tab[aria-selected="true"] .rf-tabs__badge {
    background: var(--brand);
    color: var(--bg-0);
  }
</style>
