<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { base } from '$app/paths';
  import { ChevronDown } from 'lucide-svelte';

  export let value: string = '';
  export let category: string = ''; // Filter by category
  export let categories: string[] = []; // Multiple categories
  export let placeholder: string = 'Select...';
  export let readonly: boolean = false;
  export let showColor: boolean = true;
  export let allowCustom: boolean = false; // Allow custom text input
  export let showValueInTrigger: boolean = false; // If true, show selected value in trigger (old behavior)

  interface Material {
    id: number;
    category: string;
    code: string;
    name_en: string;
    thickness_options: number[];
    metadata: {
      hex?: string;
      short_name?: string;
      type?: string;
      brand?: string;
      [key: string]: any;
    };
  }

  const dispatch = createEventDispatcher();

  let materials: Material[] = [];
  let filteredMaterials: Material[] = [];
  let loading = true;
  let open = false;
  let search = '';
  let selectedMaterial: Material | null = null;
  let dropdownRef: HTMLElement;
  let customMode = false; // For custom text input mode

  // Get hex color from selected material
  $: hexColor = selectedMaterial?.metadata?.hex || '';
  
  // Get short name for display - priority: metadata.short_name > colorCode > code > name
  $: shortName = selectedMaterial?.metadata?.short_name || 
                 selectedMaterial?.metadata?.colorCode ||
                 getShortName(selectedMaterial?.code || value, selectedMaterial?.category);

  // Load materials on mount
  onMount(async () => {
    await loadMaterials();
    // Find initially selected material
    if (value) {
      selectedMaterial = materials.find(m => m.code === value || m.name_en === value) || null;
      // If value exists but no material found, we're in custom mode
      if (!selectedMaterial && value) {
        customMode = true;
      }
    }
  });
  
  // Extract short name from value - improved to extract proper codes
  function getShortName(val: string, cat?: string): string {
    if (!val) return '';
    
    // For Oracal/Vinyl - show FULL code like 8500_064 (series_colorCode)
    if (cat?.includes('ORACAL') || cat?.includes('VINYL') || val.toLowerCase().includes('oracal')) {
      // Match complete Oracal codes: 8500-064, 8500_064, 8500 064, etc.
      const fullMatch = val.match(/(\d{4})[-_\s]?(\d{2,3})/);
      if (fullMatch) return `${fullMatch[1]}_${fullMatch[2]}`;
      // Try to extract from ORACAL_8500_064 format
      const oracalMatch = val.match(/ORACAL[_-]?(\d{4})[_-]?(\d{2,3})/i);
      if (oracalMatch) return `${oracalMatch[1]}_${oracalMatch[2]}`;
      // Just series + color code at end
      const seriesMatch = val.match(/(\d{4})/);
      const colorMatch = val.match(/[-_](\d{2,3})(?:\s|$)/);
      if (seriesMatch && colorMatch) return `${seriesMatch[1]}_${colorMatch[1]}`;
      // Fallback: try to get any 4-digit + 2-3 digit pattern
      const anyMatch = val.match(/\b(\d{4})\D+(\d{2,3})\b/);
      if (anyMatch) return `${anyMatch[1]}_${anyMatch[2]}`;
      return val.replace(/oracal\s*/i, '').replace(/vinyl\s*/i, '').trim().substring(0, 12).toUpperCase();
    }
    
    // For acrylic - extract colorCode like 3N570, WN071, 0F00, WH10
    if (cat?.includes('ACRYLIC') || val.toLowerCase().includes('acrylic') || val.toLowerCase().includes('plexi')) {
      // Look for standard PLEXIGLAS colorCodes: 3N570, WN071, WH10, 0F00, 0E010, 7A670
      const codePatterns = [
        /\b(\d[A-Z]\d{3})\b/i,       // 3N570, 0F00, 0E010
        /\b([A-Z]{2}\d{2,3})\b/i,    // WN071, WH10, WN297
        /\b(\d[A-Z]{2}\d{2})\b/i,    // 7A670
      ];
      for (const pattern of codePatterns) {
        const match = val.match(pattern);
        if (match) return match[1].toUpperCase();
      }
      // Try extracting from PLEXIGLAS_XT_3N570 format
      const plexMatch = val.match(/(?:XT|GS|LED)[_-]?([A-Z0-9]{4,6})/i);
      if (plexMatch) return plexMatch[1].toUpperCase();
      // Descriptive fallbacks
      if (val.toLowerCase().includes('opal')) return 'OPAL';
      if (val.toLowerCase().includes('clear') || val.includes('0F00')) return 'CLEAR';
      if (/white/i.test(val) && !/opal/i.test(val)) return 'WHITE';
      // Last part might be the code
      const parts = val.split(/[-_\s]+/);
      const lastPart = parts[parts.length - 1];
      if (lastPart && /^[A-Z0-9]{4,6}$/i.test(lastPart)) return lastPart.toUpperCase();
      return 'PLEX';
    }
    
    // For ALU - show ALU + thickness or dimensions
    if (cat?.includes('ALU') || val.toLowerCase().includes('alu')) {
      // Extract thickness like 1.5mm, 2.0mm
      const thicknessMatch = val.match(/([\d.,]+)\s*mm/i);
      if (thicknessMatch) return `ALU ${thicknessMatch[1].replace(',', '.')}`;
      // Extract profile dimensions like 40x40, 20x20
      const profileMatch = val.match(/(\d+x\d+)/i);
      if (profileMatch) return `ALU ${profileMatch[1]}`;
      // Extract from code like ALU_MILL_1_5 -> ALU 1.5
      const codeMatch = val.match(/ALU[_-]?(?:MILL|BRUSH|ANOD)?[_-]?(\d)[_-]?(\d)/i);
      if (codeMatch) return `ALU ${codeMatch[1]}.${codeMatch[2]}`;
      return 'ALU';
    }
    
    // For PVC
    if (cat?.includes('PVC') || val.toLowerCase().includes('pvc') || val.toLowerCase().includes('forex')) {
      const thicknessMatch = val.match(/(\d+)\s*mm/i);
      if (thicknessMatch) return `PVC ${thicknessMatch[1]}`;
      if (val.toLowerCase().includes('forex')) return 'FOREX';
      return 'PVC';
    }
    
    // For RAL paint - just the 4-digit code
    if (cat?.includes('RAL') || val.toLowerCase().includes('ral')) {
      const ralMatch = val.match(/\b(\d{4})\b/);
      if (ralMatch) return ralMatch[1];
    }
    
    // For Pantone
    if (cat?.includes('PANTONE') || val.toLowerCase().includes('pantone')) {
      const pantoneMatch = val.match(/(\d+\s*[A-Z]*)/i);
      if (pantoneMatch) return pantoneMatch[1].trim();
    }
    
    // For LED modules - Brand + Color Temp (e.g., "BaltLed 4500K")
    if (cat?.includes('LED')) {
      const parts: string[] = [];
      const brandMatch = val.match(/\b(BaltLed|Sloan|Samsung|Nichia|Osram|Cree|LemLux|LG|Seoul)\b/i);
      if (brandMatch) parts.push(brandMatch[1]);
      const tempMatch = val.match(/(\d{4})\s*[kK]/);
      if (tempMatch) parts.push(`${tempMatch[1]}K`);
      const colorNameMatch = val.match(/\b(warm|cold|neutral|daylight|white|rgb)\b/i);
      if (colorNameMatch && parts.length < 2) parts.push(colorNameMatch[1].toUpperCase());
      if (parts.length > 0) return parts.join(' ');
      const wattMatch = val.match(/(\d+\.?\d*)\s*[wW]/);
      if (wattMatch) return `${wattMatch[1]}W`;
      return 'LED';
    }
    
    // For PSU - Brand + Watts (e.g., "MeanWell 100W")
    if (cat?.includes('PSU')) {
      const parts: string[] = [];
      const brandMatch = val.match(/\b(MeanWell|Mean\s*Well|Philips|Inventronics|Osram|Tridonic)\b/i);
      if (brandMatch) parts.push(brandMatch[1].replace(/\s+/g, ''));
      const wattMatch = val.match(/(\d+)\s*[wW]/);
      if (wattMatch) parts.push(`${wattMatch[1]}W`);
      if (parts.length > 0) return parts.join(' ');
      return 'PSU';
    }
    
    // For Cables/Wire - Dimensions + Color (e.g., "2x0.75 BLACK")
    if (cat?.includes('WIRE') || cat?.includes('CABLE')) {
      const parts: string[] = [];
      const dimsMatch = val.match(/(\d+x[\d.,]+)/i);
      if (dimsMatch) parts.push(dimsMatch[1]);
      const cableColorMatch = val.match(/\b(black|white|red|blue|green|grey|gray)\b/i);
      if (cableColorMatch) parts.push(cableColorMatch[1].toUpperCase());
      if (parts.length > 0) return parts.join(' ');
      return 'CABLE';
    }
    
    // Default: try to find a code-like pattern first
    const codePattern = val.match(/\b([A-Z0-9]{3,8})\b/i);
    if (codePattern && !/the|and|for|with|board|sheet|foam/i.test(codePattern[1])) {
      return codePattern[1].toUpperCase();
    }
    const words = val.split(/[\s_-]+/).filter(w => w.length > 1 && !/the|and|for|with/i.test(w));
    if (words.length > 0) {
      return words[0].substring(0, 8).toUpperCase();
    }
    return val.substring(0, 8).toUpperCase();
  }

  async function loadMaterials() {
    loading = true;
    try {
      let url = `${base}/api/materials`;
      if (category) {
        url += `?category=${category}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        let data = await res.json();
        // Filter by categories if specified
        if (categories.length > 0) {
          data = data.filter((m: Material) => categories.includes(m.category));
        }
        materials = data;
        filteredMaterials = data;
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
    } finally {
      loading = false;
    }
  }

  function filterMaterials() {
    if (!search.trim()) {
      filteredMaterials = materials;
    } else {
      const q = search.toLowerCase();
      filteredMaterials = materials.filter(m => 
        m.name_en?.toLowerCase().includes(q) ||
        m.code?.toLowerCase().includes(q) ||
        m.metadata?.brand?.toLowerCase().includes(q)
      );
    }
  }

  function selectMaterial(material: Material) {
    selectedMaterial = material;
    value = material.name_en || material.code;
    open = false;
    search = '';
    customMode = false;
    // Priority: metadata.short_name > metadata.colorCode > extracted from code > extracted from name
    const short = material.metadata?.short_name || 
                  material.metadata?.colorCode ||
                  getShortName(material.code, material.category) ||
                  getShortName(value, material.category);
    dispatch('change', { 
      value, 
      material,
      hex: material.metadata?.hex || '',
      shortName: short
    });
  }

  function clearSelection() {
    selectedMaterial = null;
    value = '';
    customMode = false;
    dispatch('change', { value: '', material: null, hex: '' });
  }

  function toggleDropdown() {
    if (readonly) return;
    if (customMode) {
      // In custom mode, click switches back to dropdown mode
      customMode = false;
      return;
    }
    open = !open;
    if (open) {
      search = '';
      filterMaterials();
    }
  }
  
  function enterCustomMode() {
    if (readonly || !allowCustom) return;
    customMode = true;
    open = false;
    selectedMaterial = null;
  }
  
  // Custom color for custom values
  let customHex = '';
  
  function handleCustomInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = target.value;
    // For custom values, dispatch with custom hex if set
    dispatch('change', { 
      value, 
      material: null, 
      hex: customHex,
      shortName: value // Custom value = exact text as entered
    });
  }
  
  function handleCustomColorChange(e: Event) {
    const target = e.target as HTMLInputElement;
    customHex = target.value;
    // Re-dispatch with updated color
    dispatch('change', { 
      value, 
      material: null, 
      hex: customHex,
      shortName: value
    });
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      open = false;
    }
  }

  // Group materials by category for display
  $: groupedMaterials = filteredMaterials.reduce((acc, m) => {
    const cat = m.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {} as Record<string, Material[]>);

  $: categoryOrder = Object.keys(groupedMaterials).sort();
</script>

<svelte:window on:click={handleClickOutside} />

<div class="material-select" bind:this={dropdownRef}>
  {#if customMode}
    <!-- Custom text input mode with color picker -->
    <div class="custom-mode">
      <input
        type="color"
        class="custom-color-picker"
        bind:value={customHex}
        on:input={handleCustomColorChange}
        title="Pick color for custom value"
        disabled={readonly}
      />
      <input
        type="text"
        class="custom-text-input"
        bind:value
        on:input={handleCustomInput}
        placeholder="Enter custom value..."
        disabled={readonly}
      />
      <button type="button" class="btn-switch-mode" on:click={() => { customMode = false; }} title="Switch to material picker">
        <ChevronDown size={14} />
      </button>
    </div>
  {:else}
    <button
      type="button"
      class="select-trigger"
      class:open
      class:has-value={value && showValueInTrigger}
      disabled={readonly}
      on:click={toggleDropdown}
    >
      {#if showValueInTrigger && (selectedMaterial || value)}
        <span class="selected-value">
          {#if showColor && hexColor}
            <span class="color-dot" style="background-color: {hexColor}"></span>
          {/if}
          <span class="value-text">{shortName || value}</span>
        </span>
      {:else}
        <span class="placeholder">{placeholder}</span>
      {/if}
      <ChevronDown size={14} class="chevron" />
    </button>
  {/if}

  {#if open}
    <div class="dropdown">
      <div class="search-box">
        <input
          type="text"
          bind:value={search}
          on:input={filterMaterials}
          placeholder="Search materials..."
          class="search-input"
        />
      </div>
      
      {#if allowCustom}
        <button type="button" class="custom-option" on:click={enterCustomMode}>
          ✏️ Enter custom value...
        </button>
      {/if}
      
      <div class="options-list">
        {#if loading}
          <div class="loading">Loading materials...</div>
        {:else if filteredMaterials.length === 0}
          <div class="no-results">No materials found</div>
        {:else}
          {#each categoryOrder as cat}
            <div class="category-group">
              <div class="category-header">{cat.replace(/_/g, ' ')}</div>
              {#each groupedMaterials[cat] as material}
                <button
                  type="button"
                  class="option"
                  class:selected={selectedMaterial?.id === material.id}
                  on:click={() => selectMaterial(material)}
                >
                  {#if showColor && material.metadata?.hex}
                    <span class="color-dot" style="background-color: {material.metadata.hex}"></span>
                  {/if}
                  <span class="option-name">{material.name_en || material.code}</span>
                  {#if material.thickness_options?.length > 0}
                    <span class="option-thickness">{material.thickness_options.join('/')}mm</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .material-select {
    position: relative;
    width: 100%;
  }

  .select-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm, 8px);
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    background: var(--bg-1, white);
    border: 1px solid var(--border, #d1d5db);
    border-radius: var(--radius-sm, 4px);
    font-size: var(--font-size-sm, 12px);
    cursor: pointer;
    text-align: left;
    color: var(--text, #333);
    min-height: var(--control-xs, 28px);
    transition: border-color 0.15s;
  }

  .select-trigger:hover:not(:disabled) {
    border-color: var(--border-strong, #9ca3af);
  }

  .select-trigger:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .select-trigger.open {
    border-color: var(--accent-1, #3b82f6);
  }

  .select-trigger.has-value {
    /* No background color change */
  }

  .selected-value {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .value-text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .value-brand {
    font-size: 9px;
    opacity: 0.7;
  }

  .placeholder {
    color: var(--muted, #9ca3af);
    font-weight: 400;
  }

  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid rgba(0,0,0,0.2);
    flex-shrink: 0;
  }

  :global(.chevron) {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 0.2s;
  }

  .select-trigger.open :global(.chevron) {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--bg-1, white);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    z-index: 1000;
    max-height: 300px;
    display: flex;
    flex-direction: column;
  }

  .search-box {
    padding: 8px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }

  .search-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 4px;
    font-size: 12px;
    background: var(--bg-2, #f9fafb);
    color: var(--text, #333);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-1, #ff6b35);
  }

  .options-list {
    overflow-y: auto;
    max-height: 240px;
  }

  .loading,
  .no-results {
    padding: 16px;
    text-align: center;
    color: var(--muted, #9ca3af);
    font-size: 12px;
  }

  .category-group {
    border-bottom: 1px solid var(--border, #e5e7eb);
  }

  .category-group:last-child {
    border-bottom: none;
  }

  .category-header {
    padding: 6px 10px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted, #9ca3af);
    background: var(--bg-2, #f9fafb);
    position: sticky;
    top: 0;
  }

  .option {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-size: 11px;
    color: var(--text, #333);
    transition: background 0.1s;
  }

  .option:hover {
    background: var(--bg-2, #f3f4f6);
  }

  .option.selected {
    background: color-mix(in oklab, var(--accent-1, #ff6b35) 10%, var(--bg-1, white));
  }

  .option-name {
    flex: 1;
    font-weight: 500;
  }

  .option-thickness {
    font-size: 9px;
    color: var(--muted, #9ca3af);
    padding: 2px 4px;
    background: var(--bg-2, #f3f4f6);
    border-radius: 2px;
  }
  
  /* Custom mode styles */
  .custom-mode {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .custom-color-picker {
    width: 32px;
    height: 32px;
    padding: 2px;
    border: 2px solid var(--border, #d1d5db);
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }
  
  .custom-color-picker::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
  
  .custom-color-picker::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  
  .custom-color-picker:hover {
    border-color: var(--accent-1, #ff6b35);
  }
  
  .custom-text-input {
    flex: 1;
    padding: 6px 10px;
    border: 2px solid var(--accent-1, #ff6b35);
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    background: var(--bg-1, white);
    color: var(--text, #333);
    min-height: 32px;
  }
  
  .custom-text-input:focus {
    outline: none;
    border-color: var(--accent-1, #ff6b35);
    box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.2);
  }
  
  .custom-text-input::placeholder {
    color: var(--muted, #9ca3af);
    font-weight: 400;
  }
  
  .btn-switch-mode {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 2px solid var(--border, #333);
    border-radius: 3px;
    background: var(--bg-2, #f3f4f6);
    cursor: pointer;
    color: var(--text, #333);
    transition: all 0.15s;
  }
  
  .btn-switch-mode:hover {
    border-color: var(--accent-1, #ff6b35);
    background: var(--bg-1, white);
  }
  
  .custom-option {
    width: 100%;
    padding: 10px 10px;
    border: none;
    border-bottom: 1px solid var(--border, #e5e7eb);
    background: color-mix(in oklab, var(--accent-1, #ff6b35) 5%, var(--bg-1, white));
    cursor: pointer;
    text-align: left;
    font-size: 11px;
    color: var(--accent-1, #ff6b35);
    font-weight: 500;
  }
  
  .custom-option:hover {
    background: color-mix(in oklab, var(--accent-1, #ff6b35) 10%, var(--bg-1, white));
  }
  
  .custom-value {
    font-style: italic;
    color: var(--accent-1, #ff6b35);
  }
</style>
