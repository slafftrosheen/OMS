<script lang="ts">
  export let value: string = '';
  export let label: string = 'Color';
  export let colors: { code: string; hex: string; name?: string }[] = [];
  export let allowCustom: boolean = false;

  let customColor = '';

  function selectColor(code: string, hex: string) {
    value = code;
    customColor = '';
  }

  function handleCustomInput() {
    if (customColor) {
      value = customColor;
    }
  }
</script>

<div class="color-selector">
  <label class="label">{label}</label>
  <div class="colors-grid">
    {#each colors as color}
      <button
        type="button"
        class="color-swatch"
        class:active={value === color.code}
        style="--swatch-color: {color.hex}"
        on:click={() => selectColor(color.code, color.hex)}
        title={color.name || color.code}
      >
        <span class="swatch-box" />
        <span class="swatch-label">{color.code}</span>
      </button>
    {/each}
  </div>
  {#if allowCustom}
    <div class="custom-input">
      <input
        type="text"
        bind:value={customColor}
        on:input={handleCustomInput}
        placeholder="Custom color code"
        class="rf-input"
      />
    </div>
  {/if}
  {#if value}
    <div class="selected-value">
      Selected: <strong>{value}</strong>
    </div>
  {/if}
</div>

<style>
  .color-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
  }

  .colors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: var(--space-sm);
  }

  .color-swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-0);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .color-swatch:hover {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 5%, var(--bg-0));
  }

  .color-swatch.active {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 10%, var(--bg-0));
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent-1) 20%, transparent);
  }

  .swatch-box {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: var(--swatch-color, #ccc);
    border: 1px solid var(--border);
  }

  .swatch-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text);
  }

  .custom-input {
    margin-top: var(--space-xs);
  }

  .rf-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    font: inherit;
  }

  .selected-value {
    font-size: 0.875rem;
    color: var(--muted);
  }
</style>
