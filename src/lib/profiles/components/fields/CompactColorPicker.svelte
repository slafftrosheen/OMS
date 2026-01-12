<!-- src/lib/profiles/components/fields/CompactColorPicker.svelte -->
<!-- A compact color picker for use in profile forms - uses existing catalog data -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Palette, X, ChevronDown } from 'lucide-svelte';
  
  // Import catalog data directly
  import ralColors from '$lib/profiles/data/ral-classic.json';
  import oracalColors from '$lib/profiles/data/oracal-8500.json';
  import pantoneColors from '$lib/profiles/data/pantone-solid-coated.json';
  
  export let value: { system: string; code: string; hex: string } = { system: '', code: '', hex: '' };
  export let label: string = '';
  export let readonly: boolean = false;
  export let compact: boolean = true;
  
  const dispatch = createEventDispatcher();
  
  let isOpen = false;
  let selectedSystem: 'RAL' | 'ORACAL' | 'PANTONE' = 'RAL';
  let searchQuery = '';
  
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
  
  $: colors = getColors();
  $: filteredColors = searchQuery 
    ? colors.filter((c: any) => 
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 30)
    : colors.slice(0, 30);
  
  function selectColor(color: { code: string; name: string; hex: string }) {
    value = { system: selectedSystem, code: color.code, hex: color.hex };
    isOpen = false;
    searchQuery = '';
    dispatch('change', value);
  }
  
  function clearSelection() {
    value = { system: '', code: '', hex: '' };
    dispatch('change', value);
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
      isOpen = !isOpen;
    }
  }
  
  // Close picker when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.compact-color-picker')) {
      isOpen = false;
    }
  }
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="compact-color-picker" class:compact class:has-value={!!value.code}>
  {#if label}
    <span class="picker-label">{label}</span>
  {/if}
  
  <button
    type="button"
    class="picker-trigger"
    style={value.hex ? `background-color: ${value.hex}; color: ${getTextColor(value.hex)}; border-color: ${value.hex};` : ''}
    on:click={togglePicker}
    disabled={readonly}
  >
    {#if value.code}
      <span class="selected-code">{value.system} {value.code}</span>
      {#if !readonly}
        <button type="button" class="clear-btn" on:click|stopPropagation={clearSelection}>
          <X size={12} />
        </button>
      {/if}
    {:else}
      <Palette size={14} />
      <span class="placeholder">Select</span>
      <ChevronDown size={12} />
    {/if}
  </button>
  
  {#if isOpen}
    <div class="picker-dropdown">
      <!-- System Tabs -->
      <div class="system-tabs">
        <button
          type="button"
          class="system-tab"
          class:active={selectedSystem === 'RAL'}
          on:click={() => { selectedSystem = 'RAL'; searchQuery = ''; }}
        >RAL</button>
        <button
          type="button"
          class="system-tab"
          class:active={selectedSystem === 'ORACAL'}
          on:click={() => { selectedSystem = 'ORACAL'; searchQuery = ''; }}
        >ORACAL</button>
        <button
          type="button"
          class="system-tab"
          class:active={selectedSystem === 'PANTONE'}
          on:click={() => { selectedSystem = 'PANTONE'; searchQuery = ''; }}
        >PANTONE</button>
      </div>
      
      <!-- Search -->
      <div class="search-box">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search..."
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
            on:click={() => selectColor(color)}
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
    color: #333;
  }
  
  .picker-trigger {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    min-width: 80px;
    min-height: 28px;
    background: #fff;
    border: 2px solid #000;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    transition: all 0.15s ease;
  }
  
  .picker-trigger:disabled {
    cursor: default;
    opacity: 0.8;
  }
  
  .picker-trigger:hover:not(:disabled) {
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .selected-code {
    flex: 1;
    text-align: center;
    font-family: 'Courier New', monospace;
    font-size: 11px;
  }
  
  .placeholder {
    color: #999;
  }
  
  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: rgba(0,0,0,0.2);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: inherit;
  }
  
  .clear-btn:hover {
    background: rgba(0,0,0,0.3);
  }
  
  .picker-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    min-width: 280px;
    max-width: 320px;
    background: #fff;
    border: 2px solid #000;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    margin-top: 2px;
  }
  
  .system-tabs {
    display: flex;
    border-bottom: 1px solid #eee;
  }
  
  .system-tab {
    flex: 1;
    padding: 8px 4px;
    background: #f5f5f5;
    border: none;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .system-tab:first-child {
    border-radius: 4px 0 0 0;
  }
  
  .system-tab:last-child {
    border-radius: 0 4px 0 0;
  }
  
  .system-tab.active {
    background: #4A5568;
    color: #fff;
  }
  
  .search-box {
    padding: 6px;
    border-bottom: 1px solid #eee;
  }
  
  .search-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 11px;
    outline: none;
  }
  
  .search-input:focus {
    border-color: #4A5568;
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
    border: 1px solid rgba(0,0,0,0.2);
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
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  
  .no-results {
    grid-column: 1 / -1;
    padding: 16px;
    text-align: center;
    color: #999;
    font-size: 11px;
  }
  
  /* Scrollbar */
  .colors-grid::-webkit-scrollbar {
    width: 6px;
  }
  
  .colors-grid::-webkit-scrollbar-track {
    background: #f5f5f5;
  }
  
  .colors-grid::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 3px;
  }
</style>
