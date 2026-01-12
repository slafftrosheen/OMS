<!-- src/lib/profiles/components/fields/OracalSelector.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Search } from 'lucide-svelte';

  export let value: string = ''; // Selected color code
  export let label: string = 'ORACAL Film';
  export let series: string = '8500'; // Series number
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let showColorPreview: boolean = true;

  let searchQuery = '';
  let oracalColors: any[] = [];
  let filteredColors: any[] = [];
  let selectedColor: any = null;

  // ORACAL 8500 colors from PDF
  const oracal8500Colors = [
    { code: '010', name: 'White', hex: '#FFFFFF', popular: true },
    { code: '021', name: 'Yellow', hex: '#FFD700', popular: true },
    { code: '025', name: 'Lemon Yellow', hex: '#FFF44F', popular: false },
    { code: '031', name: 'Red', hex: '#E60000', popular: true },
    { code: '060', name: 'Dark Blue', hex: '#003087', popular: true },
    { code: '063', name: 'Signal Red', hex: '#D3212C', popular: true },
    { code: '070', name: 'Black', hex: '#000000', popular: true },
    { code: '097', name: 'Orange', hex: '#FF6600', popular: true },
    { code: '300', name: 'Silver Mirror', hex: '#C0C0C0', popular: true },
    { code: '313', name: 'Satin Silver', hex: '#B8B8B8', popular: false },
    { code: '415', name: 'Sky Blue', hex: '#87CEEB', popular: false },
    { code: '461', name: 'Blue', hex: '#0066CC', popular: false },
    { code: '467', name: 'Blue 2', hex: '#0052A5', popular: false },
    { code: '479', name: 'Ultramarine', hex: '#1E3A8A', popular: true },
    { code: '503', name: 'Sapphire Blue', hex: '#0F52BA', popular: false },
    { code: '606', name: 'Purple', hex: '#800080', popular: false },
    { code: '610', name: 'Magenta', hex: '#E0115F', popular: false },
    { code: '664', name: 'Violet', hex: '#9400D3', popular: false },
    { code: '721', name: 'Black/Grey', hex: '#4A4A4A', popular: false },
    { code: '785', name: 'Black', hex: '#1C1C1C', popular: false },
    { code: '817', name: 'Brown', hex: '#8B4513', popular: false },
    { code: '896', name: 'Bronze', hex: '#CD7F32', popular: false },
    { code: '906', name: 'White ALU', hex: '#F5F5F5', popular: false },
    { code: '933', name: 'Ivory', hex: '#FFFFF0', popular: false },
    { code: '948', name: 'Beige', hex: '#F5F5DC', popular: false },
    { code: '971', name: 'White', hex: '#FAFAFA', popular: false },
    { code: '118', name: 'Yellow', hex: '#FFED00', popular: false },
    { code: '121', name: 'Kelly Green', hex: '#4CBB17', popular: false },
    { code: '132', name: 'Signal Green', hex: '#00A651', popular: false },
    { code: '155', name: 'Yellow 2', hex: '#FFE135', popular: false },
    { code: '166', name: 'Apple Green', hex: '#8DB600', popular: false },
    { code: '185', name: 'MC Yellow', hex: '#FFD200', popular: false },
    { code: '246', name: 'Yellow Gold', hex: '#F4C430', popular: false },
    { code: '273', name: 'Red', hex: '#C41E3A', popular: false },
    { code: '417', name: 'Blue 417', hex: '#4169E1', popular: false },
    { code: '509', name: 'Azur Blue', hex: '#007FFF', popular: false },
    { code: '528', name: 'Yellow Green', hex: '#9ACD32', popular: false },
    { code: '743', name: 'Traffic Grey', hex: '#6C757D', popular: false },
  ];

  onMount(() => {
    oracalColors = oracal8500Colors;
    filteredColors = oracalColors;
    
    if (value) {
      selectedColor = oracalColors.find(c => c.code === value);
    }
  });

  function filterColors() {
    const query = searchQuery.toLowerCase();
    filteredColors = oracalColors.filter(color =>
      color.code.includes(query) ||
      color.name.toLowerCase().includes(query)
    );
  }

  function selectColor(color: any) {
    selectedColor = color;
    value = color.code;
  }

  $: if (searchQuery !== undefined) {
    filterColors();
  }

  // Group colors: popular first, then others
  $: popularColors = filteredColors.filter(c => c.popular);
  $: otherColors = filteredColors.filter(c => !c.popular);
</script>

<div class="oracal-selector">
  <label class="label">
    {label} - {series} Series
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <!-- Search Box -->
  <div class="search-box">
    <Search size={16} />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search by code or color name..."
      class="search-input"
    />
  </div>

  <!-- Selected Color Preview -->
  {#if selectedColor && showColorPreview}
    <div class="selected-preview">
      <div 
        class="preview-box"
        style="background-color: {selectedColor.hex}; border: 2px solid #000;"
      >
        <span class="preview-code" style="color: {selectedColor.hex === '#FFFFFF' || selectedColor.hex === '#FFF44F' ? '#000' : '#fff'};">
          {selectedColor.code}
        </span>
      </div>
      <div class="preview-info">
        <strong>ORACAL {series}-{selectedColor.code}</strong>
        <span>{selectedColor.name}</span>
      </div>
    </div>
  {/if}

  <!-- Popular Colors -->
  {#if popularColors.length > 0}
    <div class="color-section">
      <h4 class="section-title">⭐ Most Used</h4>
      <div class="colors-grid">
        {#each popularColors as color}
          <button
            class="color-item"
            class:selected={selectedColor?.code === color.code}
            on:click={() => selectColor(color)}
            style="background-color: {color.hex}; border: 2px solid {selectedColor?.code === color.code ? '#000' : '#ccc'};"
            title="{color.name} ({color.code})"
            {disabled}
          >
            <span class="color-code" style="color: {color.hex === '#FFFFFF' || color.hex === '#FFD700' || color.hex === '#FFF44F' ? '#000' : '#fff'};">
              {color.code}
            </span>
            <span class="color-name" style="color: {color.hex === '#FFFFFF' || color.hex === '#FFD700' || color.hex === '#FFF44F' ? '#000' : '#fff'};">
              {color.name}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- All Colors -->
  {#if otherColors.length > 0}
    <div class="color-section">
      <h4 class="section-title">All Colors</h4>
      <div class="colors-grid">
        {#each otherColors as color}
          <button
            class="color-item"
            class:selected={selectedColor?.code === color.code}
            on:click={() => selectColor(color)}
            style="background-color: {color.hex}; border: 2px solid {selectedColor?.code === color.code ? '#000' : '#ccc'};"
            title="{color.name} ({color.code})"
            {disabled}
          >
            <span class="color-code" style="color: {color.hex === '#FFFFFF' || color.hex === '#FFD700' ? '#000' : '#fff'};">
              {color.code}
            </span>
            <span class="color-name" style="color: {color.hex === '#FFFFFF' || color.hex === '#FFD700' ? '#000' : '#fff'};">
              {color.name}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .oracal-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-md, 12px);
  }

  .label {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .required {
    color: var(--danger, #dc2626);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px);
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
  }

  .search-input {
    flex: 1;
    border: none;
    background: none;
    font-size: var(--text-sm, 0.875rem);
    outline: none;
  }

  .selected-preview {
    display: flex;
    align-items: center;
    gap: var(--space-md, 12px);
    padding: var(--space-md, 12px);
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
  }

  .preview-box {
    width: 80px;
    height: 80px;
    border-radius: var(--radius-md, 6px);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
  }

  .preview-code {
    font-size: var(--text-2xl, 1.5rem);
    font-weight: 700;
    font-family: 'Courier New', monospace;
  }

  .preview-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .color-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
  }

  .section-title {
    margin: 0;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .colors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: var(--space-sm, 8px);
  }

  .color-item {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--space-xs, 4px);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: 70px;
  }

  .color-item:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .color-item.selected {
    box-shadow: 0 0 0 3px var(--primary, #3b82f6);
    transform: scale(1.05);
  }

  .color-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .color-code {
    font-family: 'Courier New', monospace;
    font-weight: 700;
    font-size: var(--text-md, 1rem);
  }

  .color-name {
    font-size: 10px;
    text-align: center;
    line-height: 1.2;
    font-weight: 600;
  }
</style>
