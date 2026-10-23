<!-- src/lib/profiles/components/fields/CompactColorPicker.svelte -->
<!-- A compact color picker for use in profile forms - uses existing catalog data -->
<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Palette from 'lucide-svelte/icons/palette';
  import X from 'lucide-svelte/icons/x';
  import { t } from 'svelte-i18n';

  // Import catalog data directly
  import ralColors from '$lib/profiles/data/ral-classic.json';
  import oracalColors from '$lib/profiles/data/oracal-8500.json';
  import pantoneColors from '$lib/profiles/data/pantone-solid-coated.json';

  const controlId = $props.id();
  
  let {
    value = { system: '', code: '', hex: '' },
    label = '',
    readonly = false,
    compact = true,
    onchange
  }: {
    value?: { system: string; code: string; hex: string };
    label?: string;
    readonly?: boolean;
    compact?: boolean;
    onchange?: (value: { system: string; code: string; hex: string }) => void;
  } = $props();
  
  let isOpen = $state(false);
  let selectedSystem = $state<'RAL' | 'ORACAL' | 'PANTONE'>('RAL');
  let searchQuery = $state('');
  let pickerElement = $state<HTMLDivElement>();
  let triggerElement = $state<HTMLButtonElement>();

  $effect(() => {
    if (readonly) isOpen = false;
  });
  
  // Get colors based on selected system
  function getColors() {
    switch (selectedSystem) {
      case 'RAL':
        return ralColors.map((c: any) => ({
          code: c.code,
          name: typeof c.name === 'object' ? c.name.en : c.name,
          hex: c.hex
        }));
      case 'ORACAL':
        return oracalColors.map((c: any) => ({
          code: c.code,
          name: c.name,
          hex: c.hex
        }));
      case 'PANTONE':
        return pantoneColors.map((c: any) => ({
          code: c.code,
          name: c.name,
          hex: c.hex
        }));
      default:
        return [];
    }
  }
  
  let colors = $derived(getColors());
  let filteredColors = $derived(searchQuery 
    ? colors.filter((c: any) => 
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 30)
    : colors.slice(0, 30));
  
  function selectColor(color: { code: string; name: string; hex: string }) {
    if (readonly) return;
    value = { system: selectedSystem, code: color.code, hex: color.hex };
    isOpen = false;
    searchQuery = '';
    onchange?.(value);
    triggerElement?.focus();
  }
  
  function clearSelection() {
    if (readonly) return;
    value = { system: '', code: '', hex: '' };
    onchange?.(value);
    triggerElement?.focus();
  }
  
  function getTextColor(hex: string): string {
    if (!hex || hex.length < 7) return '#000';
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }
  
  function togglePicker() {
    if (!readonly) {
      if (!isOpen && ['RAL', 'ORACAL', 'PANTONE'].includes(value.system)) {
        selectedSystem = value.system as typeof selectedSystem;
      }
      isOpen = !isOpen;
    }
  }
  
  // Close picker when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (event.target instanceof Node && !pickerElement?.contains(event.target)) {
      isOpen = false;
    }
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

<div class="compact-color-picker" bind:this={pickerElement} class:compact class:has-value={!!value.code}>
  {#if label}
    <label class="picker-label" for={controlId} id={`${controlId}-label`}>{label}</label>
  {/if}

  <div class="picker-controls" class:clearable={!!value.code && !readonly}>
    <button
      id={controlId}
      bind:this={triggerElement}
      type="button"
      class="picker-trigger"
      style={value.hex ? `background-color: ${value.hex}; color: ${getTextColor(value.hex)}; border-color: ${value.hex};` : ''}
      onclick={togglePicker}
      disabled={readonly}
      aria-expanded={isOpen}
      aria-controls={isOpen ? `${controlId}-options` : undefined}
      aria-labelledby={label ? `${controlId}-label ${controlId}-value` : undefined}
    >
      {#if value.code}
        <span class="selected-code" id={`${controlId}-value`}>{value.system} {value.code}</span>
      {:else}
        <Palette size={14} />
        <span class="placeholder" id={`${controlId}-value`}>Select</span>
        <ChevronDown size={12} />
      {/if}
    </button>
    {#if value.code && !readonly}
      <button type="button" class="clear-btn" onclick={clearSelection}
        style:color={getTextColor(value.hex)}
        aria-label={`${$t('common.remove')} ${label || value.system} ${value.code}`}>
        <X size={12} />
      </button>
    {/if}
  </div>
  
  {#if isOpen}
    <div class="picker-dropdown" id={`${controlId}-options`}>
      <!-- System Tabs -->
      <div class="system-tabs">
        <button
          type="button"
          class="system-tab"
          class:active={selectedSystem === 'RAL'}
          aria-pressed={selectedSystem === 'RAL'}
          onclick={() => { selectedSystem = 'RAL'; searchQuery = ''; }}
        >RAL</button>
        <button
          type="button"
          class="system-tab"
          class:active={selectedSystem === 'ORACAL'}
          aria-pressed={selectedSystem === 'ORACAL'}
          onclick={() => { selectedSystem = 'ORACAL'; searchQuery = ''; }}
        >ORACAL</button>
        <button
          type="button"
          class="system-tab"
          class:active={selectedSystem === 'PANTONE'}
          aria-pressed={selectedSystem === 'PANTONE'}
          onclick={() => { selectedSystem = 'PANTONE'; searchQuery = ''; }}
        >PANTONE</button>
      </div>
      
      <!-- Search -->
      <div class="search-box">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search..."
          aria-label={$t('common.search')}
          class="search-input"
        />
      </div>
      
      <!-- Colors Grid -->
      <div class="colors-grid">
        {#each filteredColors as color}
          <button
            type="button"
            class="color-swatch"
            style="background-color: {color.hex}; color: {getTextColor(color.hex)};"
            title="{color.name} ({color.code})"
            aria-pressed={value.system === selectedSystem && value.code === color.code}
            onclick={() => selectColor(color)}
          >
            <span class="swatch-code">{color.code}</span>
          </button>
        {/each}
        {#if filteredColors.length === 0}
          <div class="no-results">No colors found</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .compact-color-picker {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .picker-label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--ink-primary);
  }
  
  .picker-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    min-width: 80px;
    min-height: 28px;
    background: var(--bg-0);
    border: 2px solid var(--ink-primary);
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }
  
  .picker-trigger:disabled {
    cursor: default;
    opacity: 0.8;
  }
  
  .picker-trigger:hover:not(:disabled) {
    box-shadow: 0 2px 4px color-mix(in oklab, var(--bg-0) 10%, transparent);
  }
  
  .selected-code {
    flex: 1;
    text-align: center;
    font-family: 'Courier New', monospace;
    font-size: 11px;
  }
  
  .placeholder {
    color: var(--muted);
  }

  .picker-controls {
    position: relative;
  }

  .picker-controls.clearable .picker-trigger {
    padding-right: 30px;
  }
  
  .clear-btn {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: color-mix(in oklab, var(--bg-0) 20%, transparent);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: inherit;
  }

  .picker-trigger:focus-visible,
  .clear-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  
  .clear-btn:hover {
    background: color-mix(in oklab, var(--bg-0) 45%, transparent);
  }
  
  .picker-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: var(--z-modal);
    min-width: 280px;
    max-width: 320px;
    background: var(--bg-0);
    border: 2px solid var(--ink-primary);
    border-radius: 6px;
    box-shadow: 0 8px 24px color-mix(in oklab, var(--bg-0) 20%, transparent);
    margin-top: 2px;
  }
  
  .system-tabs {
    display: flex;
    border-bottom: 1px solid var(--bg-2);
  }
  
  .system-tab {
    flex: 1;
    padding: 8px 4px;
    background: var(--bg-2);
    border: none;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }
  
  .system-tab:first-child {
    border-radius: 4px 0 0 0;
  }
  
  .system-tab:last-child {
    border-radius: 0 4px 0 0;
  }
  
  .system-tab.active {
    background: var(--ink-secondary);
    color: var(--bg-0);
  }
  
  .search-box {
    padding: 6px;
    border-bottom: 1px solid var(--bg-2);
  }
  
  .search-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 11px;
    outline: none;
  }
  
  .search-input:focus {
    border-color: var(--ink-secondary);
  }
  
  .colors-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    padding: 6px;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .color-swatch {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in oklab, var(--bg-0) 20%, transparent);
    border-radius: 4px;
    cursor: pointer;
    font-size: 8px;
    font-weight: 700;
    font-family: 'Courier New', monospace;
    transition: transform 0.1s ease;
    min-height: 36px;
  }
  
  .color-swatch:hover {
    transform: scale(1.1);
    z-index: 1;
    box-shadow: 0 2px 8px color-mix(in oklab, var(--bg-0) 20%, transparent);
  }
  
  .no-results {
    grid-column: 1 / -1;
    padding: 16px;
    text-align: center;
    color: var(--muted);
    font-size: 11px;
  }
  
  /* Scrollbar */
  .colors-grid::-webkit-scrollbar {
    width: 6px;
  }
  
  .colors-grid::-webkit-scrollbar-track {
    background: var(--bg-2);
  }
  
  .colors-grid::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
</style>
