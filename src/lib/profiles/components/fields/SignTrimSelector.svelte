<!-- src/lib/profiles/components/fields/SignTrimSelector.svelte -->
<script lang="ts">
  import { Search } from 'lucide-svelte';

  export let value: string = '';
  export let colors: Record<string, { name: string; hex: string }> = {};
  export let label: string = 'SignTrim Color';
  export let required: boolean = false;
  export let disabled: boolean = false;

  let searchQuery = '';
  let selectedColor: { code: string; name: string; hex: string } | null = null;

  $: colorEntries = Object.entries(colors).map(([code, data]) => ({
    code,
    ...data
  }));

  $: popularColors = colorEntries.filter(c => 
    ['971', '785', '479', '155', '097', '300'].includes(c.code)
  );

  $: filteredColors = searchQuery
    ? colorEntries.filter(c =>
        c.code.includes(searchQuery) ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : colorEntries;

  $: if (value) {
    selectedColor = colorEntries.find(c => c.code === value) || null;
  }

  function selectColor(color: typeof colorEntries[0]) {
    selectedColor = color;
    value = color.code;
  }

  function getTextColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000' : '#fff';
  }
</script>

<div class="signtrim-selector">
  <label class="label">
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <!-- Search -->
  <div class="search-box">
    <Search size={16} />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search SignTrim colors..."
      class="search-input"
    />
  </div>

  <!-- Selected Preview -->
  {#if selectedColor}
    <div class="selected-preview">
      <div 
        class="preview-box"
        style="background-color: {selectedColor.hex}; color: {getTextColor(selectedColor.hex)}; border: 2px solid #000;"
      >
        <span class="signtrim-badge">SIGNTRIM</span>
        <span class="color-code">{selectedColor.code}</span>
        <span class="color-name">{selectedColor.name}</span>
      </div>
    </div>
  {/if}

  <!-- Popular Colors -->
  {#if popularColors.length > 0 && !searchQuery}
    <div class="color-section">
      <h4>⭐ Most Used</h4>
      <div class="colors-grid">
        {#each popularColors as color}
          <button
            class="color-box"
            class:selected={selectedColor?.code === color.code}
            style="background-color: {color.hex}; color: {getTextColor(color.hex)}; border: 2px solid {selectedColor?.code === color.code ? '#000' : '#999'};"
            on:click={() => selectColor(color)}
            {disabled}
            title="SIGNTRIM {color.name} {color.code}"
          >
            <span class="box-code">{color.code}</span>
            <span class="box-name">{color.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- All Colors -->
  <div class="color-section">
    <h4>All SignTrim Colors</h4>
    <div class="colors-grid">
      {#each filteredColors as color}
        <button
          class="color-box"
          class:selected={selectedColor?.code === color.code}
          style="background-color: {color.hex}; color: {getTextColor(color.hex)}; border: 2px solid {selectedColor?.code === color.code ? '#000' : '#ccc'};"
          on:click={() => selectColor(color)}
          {disabled}
          title="SIGNTRIM {color.name} {color.code}"
        >
          <span class="box-code">{color.code}</span>
          <span class="box-name">{color.name}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .signtrim-selector {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .required {
    color: #dc2626;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
  }

  .search-input {
    flex: 1;
    border: none;
    background: none;
    outline: none;
    font-size: 0.875rem;
  }

  .selected-preview {
    padding: 1rem;
    background: #f9fafb;
    border-radius: 0.5rem;
  }

  .preview-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 1rem;
    border-radius: 0.5rem;
    box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.15);
  }

  .signtrim-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    opacity: 0.8;
  }

  .color-code {
    font-size: 1.5rem;
    font-weight: 700;
    font-family: 'Courier New', monospace;
  }

  .color-name {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .color-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .color-section h4 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 700;
  }

  .colors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.5rem;
  }

  .color-box {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0.25rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: 80px;
    box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.1);
  }

  .color-box:hover:not(:disabled) {
    transform: translateY(-3px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
  }

  .color-box.selected {
    box-shadow: 0 0 0 4px #3b82f6;
    transform: scale(1.05);
  }

  .box-code {
    font-family: 'Courier New', monospace;
    font-weight: 700;
    font-size: 1rem;
  }

  .box-name {
    font-size: 10px;
    text-align: center;
    line-height: 1.2;
    font-weight: 600;
  }

  .color-box:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
