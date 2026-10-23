<!-- src/lib/profiles/components/fields/ColorRAL.svelte -->
<script lang="ts">
  import Palette from 'lucide-svelte/icons/palette';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ColorSystem } from '$lib/profiles/types';

  const controlId = $props.id();

  interface Props {
    value?: string;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    showPreview?: boolean;
    previewSize?: 'sm' | 'md' | 'lg';
    error?: string | null;
  }

  let {
    value = $bindable(''),
    label = 'RAL Color',
    required = false,
    disabled = false,
    placeholder = 'Search RAL colors...',
    showPreview = true,
    previewSize = 'md',
    error = null
  }: Props = $props();

  let colors: ColorSystem[] = $state([]);
  let selectedColor = $derived(colors.find(color => color.code === value) ?? null);
  let searchQuery: string = $state('');
  let filteredColors = $derived(colors.filter(color => {
    const query = searchQuery.toLowerCase().trim();
    return color.code.toLowerCase().includes(query) || color.name.toLowerCase().includes(query);
  }));
  let loading = $state(false);
  let isOpen = $state(false);
  let pickerElement = $state<HTMLDivElement>();
  let triggerElement = $state<HTMLButtonElement>();

  onMount(async () => {
    await loadRALColors();
  });

  async function loadRALColors() {
    loading = true;
    try {
      const response = await fetch('/api/colors?system=RAL');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      colors = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.error('Failed to load RAL colors:', err);
    } finally {
      loading = false;
    }
  }

  function selectColor(color: ColorSystem) {
    if (disabled) return;
    value = color.code;
    isOpen = false;
    searchQuery = '';
    triggerElement?.focus();
  }

  function clearSelection() {
    if (disabled) return;
    value = '';
    searchQuery = '';
    triggerElement?.focus();
  }

  function togglePicker() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }

  $effect(() => {
    if (disabled) isOpen = false;
  });

  function handleClickOutside(event: MouseEvent) {
    if (event.target instanceof Node && !pickerElement?.contains(event.target)) isOpen = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen && event.target instanceof Node && pickerElement?.contains(event.target)) {
      event.preventDefault();
      isOpen = false;
      triggerElement?.focus();
    }
  }
</script>

<svelte:document onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="color-ral" bind:this={pickerElement} class:disabled class:error={!!error}>
  <label class="label" for={controlId}>
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
      id={controlId}
      bind:this={triggerElement}
      type="button"
      class="picker-button"
      class:open={isOpen}
      class:has-value={!!selectedColor}
      aria-expanded={isOpen}
      aria-controls={isOpen ? `${controlId}-options` : undefined}
      aria-describedby={error ? `${controlId}-error` : undefined}
      onclick={togglePicker}
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
    </button>
    {#if selectedColor && !disabled}
      <button
        type="button"
        class="clear-button"
        onclick={clearSelection}
        aria-label={`${$t('common.remove')} ${label} ${selectedColor.code}`}
        title="Clear selection"
      >
        <X size={16} />
      </button>
    {/if}

    {#if isOpen && !loading}
      <div class="color-picker-panel" id={`${controlId}-options`}>
        <div class="search-box">
          <Search size={16} />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search by code or name..."
            aria-label={`${label} · ${$t('common.search')}`}
            class="search-input"
          />
        </div>

        <div class="colors-grid">
          {#each filteredColors as color (color.id)}
            <button
              type="button"
              class="color-item"
              class:selected={color.code === value}
              aria-pressed={color.code === value}
              onclick={() => selectColor(color)}
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
    <div class="error-message" id={`${controlId}-error`}>{error}</div>
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
    color: var(--text-primary, var(--ink-primary));
  }

  .required {
    color: var(--danger, var(--error));
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
    border: 2px solid var(--border, var(--border));
    flex-shrink: 0;
    box-shadow: inset 0 1px 3px color-mix(in oklab, var(--bg-0) 10%, transparent);
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
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    min-height: 44px;
    position: relative;
  }

  .picker-button:hover:not(:disabled) {
    border-color: var(--primary, var(--brand));
    background: var(--bg-2, var(--bg-2));
  }

  .picker-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .picker-button.open {
    border-color: var(--primary, var(--brand));
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
    border: 1px solid var(--border, var(--border));
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
    color: var(--text-muted, var(--ink-tertiary));
  }

  .placeholder {
    color: var(--text-muted, var(--ink-tertiary));
    font-size: var(--text-sm, 0.875rem);
  }

  .clear-button {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--bg-3, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .clear-button:hover {
    background: var(--danger-bg, var(--error-soft));
    border-color: var(--danger, var(--error));
    color: var(--danger, var(--error));
  }

  .picker-button:focus-visible,
  .clear-button:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .color-picker-panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--primary, var(--brand));
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 8px 24px color-mix(in oklab, var(--bg-0) 20%, transparent);
    z-index: var(--z-overlay);
    max-height: 480px;
    display: flex;
    flex-direction: column;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    border-bottom: 1px solid var(--border, var(--border));
  }

  .search-input {
    flex: 1;
    border: none;
    background: none;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-primary, var(--ink-primary));
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted, var(--ink-tertiary));
  }

  .colors-grid {
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1px;
    background: var(--border, var(--border));
    max-height: 400px;
  }

  .color-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--bg-1, var(--bg-0));
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .color-item:hover {
    background: var(--bg-2, var(--bg-2));
  }

  .color-item.selected {
    background: var(--primary-bg, var(--brand-soft));
    border-left: 3px solid var(--primary, var(--brand));
  }

  .color-item-swatch {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--border, var(--border));
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
    color: var(--text-muted, var(--ink-tertiary));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-results {
    grid-column: 1 / -1;
    padding: var(--space-xl, 24px);
    text-align: center;
    color: var(--text-muted, var(--ink-tertiary));
    font-size: var(--text-sm, 0.875rem);
    background: var(--bg-1, var(--bg-0));
  }

  .error-message {
    color: var(--danger, var(--error));
    font-size: var(--text-xs, 0.75rem);
    margin-top: 2px;
  }

  .color-ral.error .picker-button {
    border-color: var(--danger, var(--error));
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border, var(--border));
    border-top-color: var(--primary, var(--brand));
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
    background: var(--bg-2, var(--bg-2));
  }

  .colors-grid::-webkit-scrollbar-thumb {
    background: var(--border, var(--border));
    border-radius: var(--radius-sm, 4px);
  }

  .colors-grid::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted, var(--ink-tertiary));
  }
</style>
