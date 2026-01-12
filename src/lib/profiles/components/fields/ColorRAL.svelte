<!-- src/lib/profiles/components/fields/ColorRAL.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, X, Palette } from 'lucide-svelte';
  import type { ColorSystem } from '$lib/profiles/types';

  export let value: string = '';
  export let label: string = 'RAL Color';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let placeholder: string = 'Search RAL colors...';
  export let showPreview: boolean = true;
  export let previewSize: 'sm' | 'md' | 'lg' = 'md';
  export let error: string | null = null;

  let colors: ColorSystem[] = [];
  let filteredColors: ColorSystem[] = [];
  let selectedColor: ColorSystem | null = null;
  let searchQuery: string = '';
  let loading = false;
  let isOpen = false;

  const previewSizes = {
    sm: '32px',
    md: '48px',
    lg: '64px'
  };

  onMount(async () => {
    await loadRALColors();
  });

  async function loadRALColors() {
    loading = true;
    try {
      const response = await fetch('/api/colors?system=RAL');
      const data = await response.json();
      colors = data.items || data;
      filteredColors = colors;

      // Set selected color if value provided
      if (value) {
        selectedColor = colors.find(c => c.code === value) || null;
      }
    } catch (err) {
      console.error('Failed to load RAL colors:', err);
    } finally {
      loading = false;
    }
  }

  function filterColors() {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      filteredColors = colors;
      return;
    }

    filteredColors = colors.filter(color => 
      color.code.toLowerCase().includes(query) ||
      color.name.toLowerCase().includes(query)
    );
  }

  function selectColor(color: ColorSystem) {
    selectedColor = color;
    value = color.code;
    isOpen = false;
    searchQuery = '';
  }

  function clearSelection() {
    selectedColor = null;
    value = '';
    searchQuery = '';
  }

  function togglePicker() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }

  $: if (searchQuery !== undefined) {
    filterColors();
  }
</script>

<div class="color-ral" class:disabled class:error={!!error}>
  <label class="label">
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <div class="picker-wrapper">
    {#if showPreview && selectedColor}
      <div 
        class="color-preview" 
        class:preview-sm={previewSize === 'sm'}
        class:preview-md={previewSize === 'md'}
        class:preview-lg={previewSize === 'lg'}
        style="background-color: {selectedColor.hexValue}"
        title="{selectedColor.name} ({selectedColor.code})"
      ></div>
    {/if}

    <button
      type="button"
      class="picker-button"
      class:open={isOpen}
      class:has-value={!!selectedColor}
      on:click={togglePicker}
      {disabled}
    >
      {#if loading}
        <span class="loading-spinner"></span>
        Loading colors...
      {:else if selectedColor}
        <div class="selected-color">
          <div class="color-swatch" style="background-color: {selectedColor.hexValue}"></div>
          <div class="color-details">
            <span class="color-code">RAL {selectedColor.code}</span>
            <span class="color-name">{selectedColor.name}</span>
          </div>
        </div>
      {:else}
        <Palette size={18} />
        <span class="placeholder">{placeholder}</span>
      {/if}

      {#if selectedColor && !disabled}
        <button
          type="button"
          class="clear-button"
          on:click|stopPropagation={clearSelection}
          title="Clear selection"
        >
          <X size={16} />
        </button>
      {/if}
    </button>

    {#if isOpen && !loading}
      <div class="color-picker-panel">
        <div class="search-box">
          <Search size={16} />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search by code or name..."
            class="search-input"
          />
        </div>

        <div class="colors-grid">
          {#each filteredColors as color (color.id)}
            <button
              type="button"
              class="color-item"
              class:selected={color.code === value}
              on:click={() => selectColor(color)}
              title="{color.name} (RAL {color.code})"
            >
              <div 
                class="color-item-swatch" 
                style="background-color: {color.hexValue}"
              ></div>
              <div class="color-item-info">
                <span class="color-item-code">RAL {color.code}</span>
                <span class="color-item-name">{color.name}</span>
              </div>
            </button>
          {:else}
            <div class="no-results">
              No colors found for "{searchQuery}"
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
</div>

<style>
  .color-ral {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    position: relative;
  }

  .label {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .required {
    color: var(--danger, #dc2626);
    margin-left: 2px;
  }

  .picker-wrapper {
    position: relative;
    display: flex;
    gap: var(--space-sm, 8px);
    align-items: center;
  }

  .color-preview {
    border-radius: var(--radius-md, 6px);
    border: 2px solid var(--border, #e5e7eb);
    flex-shrink: 0;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .preview-sm { width: 32px; height: 32px; }
  .preview-md { width: 48px; height: 48px; }
  .preview-lg { width: 64px; height: 64px; }

  .picker-button {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 44px;
    position: relative;
  }

  .picker-button:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
    background: var(--bg-2, #f9fafb);
  }

  .picker-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .picker-button.open {
    border-color: var(--primary, #3b82f6);
  }

  .selected-color {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    flex: 1;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--border, #e5e7eb);
    flex-shrink: 0;
  }

  .color-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .color-code {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    font-family: var(--font-mono, monospace);
  }

  .color-name {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, #6b7280);
  }

  .placeholder {
    color: var(--text-muted, #6b7280);
    font-size: var(--text-sm, 0.875rem);
  }

  .clear-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--bg-3, #f3f4f6);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-button:hover {
    background: var(--danger-bg, #fee2e2);
    border-color: var(--danger, #dc2626);
    color: var(--danger, #dc2626);
  }

  .color-picker-panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--primary, #3b82f6);
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 100;
    max-height: 480px;
    display: flex;
    flex-direction: column;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    border-bottom: 1px solid var(--border, #e5e7eb);
  }

  .search-input {
    flex: 1;
    border: none;
    background: none;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-primary, #1a1a1a);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted, #6b7280);
  }

  .colors-grid {
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1px;
    background: var(--border, #e5e7eb);
    max-height: 400px;
  }

  .color-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--bg-1, #ffffff);
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .color-item:hover {
    background: var(--bg-2, #f9fafb);
  }

  .color-item.selected {
    background: var(--primary-bg, #dbeafe);
    border-left: 3px solid var(--primary, #3b82f6);
  }

  .color-item-swatch {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--border, #e5e7eb);
    flex-shrink: 0;
  }

  .color-item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .color-item-code {
    font-size: var(--text-xs, 0.75rem);
    font-weight: 600;
    font-family: var(--font-mono, monospace);
  }

  .color-item-name {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, #6b7280);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-results {
    grid-column: 1 / -1;
    padding: var(--space-xl, 24px);
    text-align: center;
    color: var(--text-muted, #6b7280);
    font-size: var(--text-sm, 0.875rem);
    background: var(--bg-1, #ffffff);
  }

  .error-message {
    color: var(--danger, #dc2626);
    font-size: var(--text-xs, 0.75rem);
    margin-top: 2px;
  }

  .color-ral.error .picker-button {
    border-color: var(--danger, #dc2626);
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border, #e5e7eb);
    border-top-color: var(--primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Scrollbar */
  .colors-grid::-webkit-scrollbar {
    width: 8px;
  }

  .colors-grid::-webkit-scrollbar-track {
    background: var(--bg-2, #f9fafb);
  }

  .colors-grid::-webkit-scrollbar-thumb {
    background: var(--border, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
  }

  .colors-grid::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted, #6b7280);
  }
</style>
