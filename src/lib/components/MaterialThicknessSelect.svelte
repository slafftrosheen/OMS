<script lang="ts">
  import { onMount } from 'svelte';

  let {
    value = $bindable(''),
    materialType = 'PVC',
    placeholder = 'Select thickness',
    disabled = false,
    readonly = false,
    onchange
  }: {
    value?: string;
    materialType?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
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

  onMount(async () => {
    await loadOptions();
  });

  async function loadOptions() {
    loading = true;
    try {
      const response = await fetch(`/api/material-thickness-options?materialType=${materialType}`);
      if (response.ok) {
        options = await response.json();
      }
    } catch (err) {
      console.error('Failed to load thickness options:', err);
    } finally {
      loading = false;
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

<select bind:value disabled={disabled || readonly} class="thickness-select" class:loading onchange={handleChange}>
  <option value="" disabled selected>{loading ? 'Loading...' : placeholder}</option>
  {#each options as option}
    <option value="{option.thickness}{option.unit}">
      {option.display_name}
    </option>
  {/each}
</select>

<style>
  .thickness-select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border, #d1d5db);
    border-radius: 8px;
    font-size: 14px;
    color: var(--text-primary, #1a1a1a);
    font-family: inherit;
    background: var(--input-bg, white);
    transition: all 0.2s;
    cursor: pointer;
  }

  .thickness-select:focus {
    outline: none;
    border-color: #ff6b35;
    box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
  }

  .thickness-select:disabled {
    background: var(--bg-disabled, #f3f4f6);
    color: var(--text-muted, #9ca3af);
    cursor: not-allowed;
  }

  .thickness-select.loading {
    opacity: 0.6;
  }
</style>