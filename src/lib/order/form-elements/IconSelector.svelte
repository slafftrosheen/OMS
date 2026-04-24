<script lang="ts">
  import type { Component } from 'svelte';

  let {
    value = $bindable([]),
    label = 'Select Options',
    options = [],
    multiSelect = true
  }: {
    value?: string[];
    label?: string;
    options?: { id: string; label: string; icon?: Component }[];
    multiSelect?: boolean;
  } = $props();

  function toggleOption(optionId: string) {
    if (multiSelect) {
      if (value.includes(optionId)) {
        value = value.filter(v => v !== optionId);
      } else {
        value = [...value, optionId];
      }
    } else {
      value = [optionId];
    }
  }

  function isSelected(optionId: string): boolean {
    return value.includes(optionId);
  }
</script>

<div class="icon-selector">
  <label class="label">{label}</label>
  <div class="options-grid">
    {#each options as option}
      {@const IconComponent = option.icon}
      <button
        type="button"
        class="option-item"
        class:active={isSelected(option.id)}
        onclick={() => toggleOption(option.id)}
        title={option.label}
      >
        {#if IconComponent}
          <IconComponent size={20} aria-hidden="true" />
        {/if}
        <span class="option-label">{option.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .icon-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
  }

  .options-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-sm);
  }

  .option-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-0);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    min-height: 60px;
  }

  .option-item:hover {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 5%, var(--bg-0));
  }

  .option-item.active {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 10%, var(--bg-0));
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent-1) 20%, transparent);
  }

  .option-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text);
    text-align: center;
  }
</style>
