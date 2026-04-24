<script lang="ts">
  import { onMount } from 'svelte';

  let {
    value = $bindable(''),
    materialType = 'PVC',
    placeholder = 'Select thickness',
    disabled = false,
    readonly = false,
    autoSelectLowest = true,
    onchange
  }: {
    value?: string;
    materialType?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    autoSelectLowest?: boolean;
    onchange?: () => void;
  } = $props();

  interface ThicknessOption {
    id: number;
    material_type: string;
    thickness: number;
    unit: string;
    display_name: string;
  }

  let options: ThicknessOption[] = $state([]);
  let loading = $state(true);
  let hasLoadedOnce = $state(false);

  onMount(async () => {
    await loadOptions();
  });

  async function loadOptions() {
    loading = true;
    try {
      const response = await fetch(`/api/material-thickness-options?materialType=${materialType}`);
      if (response.ok) {
        options = await response.json();
        
        // Auto-select lowest thickness if enabled and value is empty
        if (autoSelectLowest && !value && options.length > 0) {
          // Sort by thickness to find the lowest
          const sortedOptions = [...options].sort((a, b) => a.thickness - b.thickness);
          const lowestOption = sortedOptions[0];
          value = `${lowestOption.thickness}${lowestOption.unit}`;
        }
      }
    } catch (err) {
      console.error('Failed to load thickness options:', err);
    } finally {
      loading = false;
      hasLoadedOnce = true;
    }
  }

  $effect(() => {
    if (materialType) {
      loadOptions();
    }
  });

  function handleChange() {
    onchange?.();
  }
</script>

{#if hasLoadedOnce && options.length > 0 && !loading}
  <select bind:value disabled={disabled || readonly} class="thickness-select" onchange={handleChange}>
    <option value="" disabled selected>Select thickness</option>
    {#each options as option}
      <option value="{option.thickness}{option.unit}">
        {option.thickness}mm - {option.display_name}
      </option>
    {/each}
  </select>
{:else}
  <select bind:value disabled={disabled || readonly} class="thickness-select" class:loading onchange={handleChange}>
    <option value="" disabled selected>{loading ? 'Loading...' : placeholder}</option>
    {#each options as option}
      <option value="{option.thickness}{option.unit}">
        {option.thickness}mm - {option.display_name}
      </option>
    {/each}
  </select>
{/if}

<style>
  .thickness-select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    font-size: 14px;
    color: var(--text-primary, var(--ink-primary));
    font-family: inherit;
    background: var(--input-bg, white);
    transition: all 0.2s;
    cursor: pointer;
  }

  .thickness-select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 10%, transparent);
  }

  .thickness-select:disabled {
    background: var(--bg-disabled, var(--bg-2));
    color: var(--text-muted, var(--muted));
    cursor: not-allowed;
  }

  .thickness-select.loading {
    opacity: 0.6;
  }
  
  .selected-thickness {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border, var(--border));
    border-radius: 8px;
    background: var(--input-bg, white);
    min-height: 44px;
  }
  
  .thickness-value {
    font-size: 1.2rem;
    font-weight: bold;
    color: var(--text-primary, var(--ink-primary));
  }
</style>