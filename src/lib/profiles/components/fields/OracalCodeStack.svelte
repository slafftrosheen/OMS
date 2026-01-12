<!-- src/lib/profiles/components/fields/OracalCodeStack.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let codes: string[] = [];
  export let label: string = 'ORACAL Codes';
  export let readonly: boolean = false;
  export let maxCodes: number = 5;
  
  const dispatch = createEventDispatcher();
  
  // ORACAL 8500 colors lookup
  const oracalColors: Record<string, { name: string; hex: string }> = {
    '010': { name: 'White', hex: '#FFFFFF' },
    '020': { name: 'Golden Yellow', hex: '#FFD000' },
    '021': { name: 'Yellow', hex: '#FFD700' },
    '025': { name: 'Lemon Yellow', hex: '#FFF44F' },
    '031': { name: 'Red', hex: '#E60000' },
    '052': { name: 'Azure Blue', hex: '#007FFF' },
    '060': { name: 'Dark Blue', hex: '#003087' },
    '063': { name: 'Signal Red', hex: '#D3212C' },
    '070': { name: 'Black', hex: '#000000' },
    '097': { name: 'Orange', hex: '#FF6600' },
    '118': { name: 'Yellow', hex: '#FFED00' },
    '121': { name: 'Kelly Green', hex: '#4CBB17' },
    '132': { name: 'Signal Green', hex: '#00A651' },
    '155': { name: 'Yellow 2', hex: '#FFE135' },
    '166': { name: 'Apple Green', hex: '#8DB600' },
    '185': { name: 'MC Yellow', hex: '#FFD200' },
    '246': { name: 'Yellow Gold', hex: '#F4C430' },
    '273': { name: 'Red', hex: '#C41E3A' },
    '300': { name: 'Silver Mirror', hex: '#C0C0C0' },
    '313': { name: 'Satin Silver', hex: '#B8B8B8' },
    '415': { name: 'Sky Blue', hex: '#87CEEB' },
    '417': { name: 'Blue 417', hex: '#4169E1' },
    '461': { name: 'Blue', hex: '#0066CC' },
    '467': { name: 'Blue 2', hex: '#0052A5' },
    '479': { name: 'Ultramarine', hex: '#1E3A8A' },
    '503': { name: 'Sapphire Blue', hex: '#0F52BA' },
    '509': { name: 'Azur Blue', hex: '#007FFF' },
    '528': { name: 'Yellow Green', hex: '#9ACD32' },
    '606': { name: 'Purple', hex: '#800080' },
    '610': { name: 'Magenta', hex: '#E0115F' },
    '664': { name: 'Violet', hex: '#9400D3' },
    '721': { name: 'Black/Grey', hex: '#4A4A4A' },
    '743': { name: 'Traffic Grey', hex: '#6C757D' },
    '785': { name: 'Black', hex: '#1C1C1C' },
    '817': { name: 'Brown', hex: '#8B4513' },
    '896': { name: 'Bronze', hex: '#CD7F32' },
    '906': { name: 'White ALU', hex: '#F5F5F5' },
    '933': { name: 'Ivory', hex: '#FFFFF0' },
    '948': { name: 'Beige', hex: '#F5F5DC' },
    '971': { name: 'White', hex: '#FAFAFA' },
  };
  
  function getOracalColor(code: string): string {
    // Extract the color code from formats like "8500-031" or just "031"
    const colorCode = code.includes('-') ? code.split('-')[1] : code;
    return oracalColors[colorCode]?.hex || '#2563EB'; // Default to blue if not found
  }
  
  function getTextColor(bgHex: string): string {
    // Calculate luminance to determine if text should be white or black
    const hex = bgHex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }
  
  function updateCode(index: number, value: string) {
    codes[index] = value;
    codes = [...codes];
    dispatch('change', codes);
  }
  
  function addCode() {
    if (codes.length < maxCodes) {
      codes = [...codes, ''];
      dispatch('change', codes);
    }
  }
  
  function removeCode(index: number) {
    codes = codes.filter((_, i) => i !== index);
    dispatch('change', codes);
  }
</script>

<div class="oracal-stack">
  {#if label}
    <span class="stack-label">{label}</span>
  {/if}
  
  <div class="code-boxes">
    {#each codes as code, i}
      {@const bgColor = getOracalColor(code)}
      {@const textColor = getTextColor(bgColor)}
      <div class="code-box" style="background-color: {bgColor};">
        {#if readonly}
          <span class="code-value" style="color: {textColor};">{code || '—'}</span>
        {:else}
          <input
            type="text"
            class="code-input"
            style="color: {textColor};"
            value={code}
            placeholder="8500-XXX"
            on:input={(e) => updateCode(i, e.currentTarget.value)}
          />
          {#if codes.length > 1}
            <button 
              type="button"
              class="remove-btn"
              style="color: {textColor};"
              on:click={() => removeCode(i)}
              title="Remove code"
            >
              ×
            </button>
          {/if}
        {/if}
      </div>
    {/each}
    
    {#if !readonly && codes.length < maxCodes}
      <button 
        type="button"
        class="add-btn"
        on:click={addCode}
        title="Add code"
      >
        +
      </button>
    {/if}
  </div>
</div>

<style>
  .oracal-stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .stack-label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: #333;
    letter-spacing: 0.5px;
  }
  
  .code-boxes {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .code-box {
    display: flex;
    align-items: center;
    border: 2px solid #000;
    border-radius: 3px;
    min-height: 28px;
    position: relative;
    transition: background-color 0.15s ease;
  }
  
  .code-value {
    flex: 1;
    padding: 4px 8px;
    font-weight: 700;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    text-align: center;
  }
  
  .code-input {
    flex: 1;
    padding: 4px 8px;
    background: transparent;
    border: none;
    font-weight: 700;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    text-align: center;
    outline: none;
  }
  
  .code-input::placeholder {
    color: rgba(128, 128, 128, 0.7);
  }
  
  .remove-btn {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    padding: 0;
    background: rgba(0, 0, 0, 0.2);
    border: none;
    border-radius: 50%;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
  }
  
  .remove-btn:hover {
    background: rgba(0, 0, 0, 0.4);
  }
  
  .add-btn {
    padding: 4px 8px;
    background: rgba(37, 99, 235, 0.3);
    border: 2px dashed #2563EB;
    border-radius: 3px;
    color: #2563EB;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .add-btn:hover {
    background: rgba(37, 99, 235, 0.5);
    color: #fff;
  }
</style>
