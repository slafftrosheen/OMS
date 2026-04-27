<script lang="ts">
  import Hash from 'lucide-svelte/icons/hash';
  import Palette from 'lucide-svelte/icons/palette';
  import Icon from '$lib/ui/Icon.svelte';
  import type { ColorSpec } from './material-types';
  
  let { value = $bindable<ColorSpec | null>(null), onChange }: {
    value?: ColorSpec | null;
    onChange: (color: ColorSpec | null) => void;
  } = $props();
  
  let mode: 'RAL' | 'PANTONE' | 'HEX' | 'CUSTOM' = 'RAL';
  let ralInput = '';
  let pantoneInput = '';
  let hexInput = '';
  let customName = '';
  let finishType: ColorSpec['finishType'] = 'MATTE';
  
  function handleSubmit() {
    const color: ColorSpec = {
      id: crypto.randomUUID(),
      name: customName || `${mode} ${ralInput || pantoneInput || hexInput}`,
      finishType
    };
    
    if (mode === 'RAL') color.ralCode = ralInput;
    if (mode === 'PANTONE') color.pantoneCode = pantoneInput;
    if (mode === 'HEX') color.hexValue = hexInput;
    if (mode === 'CUSTOM') color.isCustom = true;
    
    onChange(color);
  }
</script>

<div class="color-picker-modal">
  <div class="modal-header">
    <Palette size={20} />
    <h3>Select Color</h3>
  </div>
  
  <div class="mode-selector">
    <button class:active={mode === 'RAL'} onclick={() => mode = 'RAL'}>RAL</button>
    <button class:active={mode === 'PANTONE'} onclick={() => mode = 'PANTONE'}>Pantone</button>
    <button class:active={mode === 'HEX'} onclick={() => mode = 'HEX'}>HEX</button>
    <button class:active={mode === 'CUSTOM'} onclick={() => mode = 'CUSTOM'}>Custom</button>
  </div>
  
  <div class="input-section">
    {#if mode === 'RAL'}
      <label>
        RAL Code
        <input 
          bind:value={ralInput} 
          placeholder="e.g., RAL 9016"
          pattern="RAL \d{4}"
        />
      </label>
    {/if}
    
    {#if mode === 'PANTONE'}
      <label>
        Pantone Code
        <input 
          bind:value={pantoneInput} 
          placeholder="e.g., Pantone 185 C"
        />
      </label>
    {/if}
    
    {#if mode === 'HEX'}
      <label>
        HEX Value
        <div class="hex-input-group">
          <Hash size={16} />
          <input 
            bind:value={hexInput} 
            placeholder="FF5733"
          pattern="[0-9A-Fa-f]{6}"
            maxlength="6"
          />
          {#if hexInput.length === 6}
            <div class="color-preview" style="background: #{hexInput}"></div>
          {/if}
        </div>
      </label>
    {/if}
    
    {#if mode === 'CUSTOM'}
      <label>
        Custom Color Name
        <input bind:value={customName} placeholder="e.g., Company Blue" />
      </label>
    {/if}
    
    <label>
      Finish Type
      <select bind:value={finishType}>
        <option value="MATTE">Matte</option>
        <option value="GLOSS">Gloss</option>
        <option value="SATIN">Satin</option>
        <option value="TEXTURED">Textured</option>
      </select>
    </label>
  </div>
  
  <div class="modal-actions">
    <button class="btn primary" onclick={handleSubmit}>Add Color</button>
    <button class="btn ghost" onclick={() => onChange(null)}>Cancel</button>
  </div>
</div>

<style>
  .color-picker-modal {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  
  .mode-selector {
    display: flex;
    gap: 8px;
    padding: 4px;
    background: var(--bg-0);
    border-radius: 8px;
  }
  
  .mode-selector button {
    flex: 1;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text-2);
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }
  
  .mode-selector button.active {
    background: var(--accent, var(--brand));
    color: var(--bg-0);
  }
  
  .input-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .input-section label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
  }
  
  .input-section input,
  .input-section select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-0);
    color: var(--text);
    font-size: 14px;
  }
  
  .hex-input-group {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  
  .hex-input-group input {
    flex: 1;
    border: none;
    background: transparent;
    font-family: monospace;
    font-size: 1rem;
    padding: 0;
  }
  
  .color-preview {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  
  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  
  .btn {
    padding: 10px 20px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }
  
  .btn.primary {
    background: var(--accent, var(--brand));
    color: var(--bg-0);
    border: none;
  }
  
  .btn.primary:hover {
    background: var(--accent-hover, var(--brand));
  }
  
  .btn.ghost {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
  }
  
  .btn.ghost:hover {
    background: var(--bg-0);
  }
</style>
