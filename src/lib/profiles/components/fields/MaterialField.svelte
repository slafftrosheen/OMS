<!-- src/lib/profiles/components/fields/MaterialField.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Material } from '$lib/profiles/types';
  import plexiglasData from '$lib/profiles/data/plexiglas-materials.json';

  export let value: {
    materialId?: number;
    materialCode?: string;
    thickness?: number;
  } = {};
  
  export let label: string = 'Material';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let materialTypes: string[] = ['ACRYLIC', 'ALUMINUM', 'PVC']; // Which material types to allow

  let selectedType: 'ACRYLIC' | 'ALUMINUM' | 'PVC' | null = null;
  let acrylicMaterials: any[] = [];
  let selectedMaterial: any | null = null;
  let thickness: number | null = null;

  // Preset thicknesses for each material type
  const aluminumThicknesses = [1.0, 1.2, 1.3, 1.5, 2.0, 3.0];
  const pvcThicknesses = [3, 5, 8, 10, 12, 15, 18, 19];
  const acrylicThicknesses = [2, 3, 4, 5, 6, 8, 10];

  onMount(async () => {
    await loadMaterials();
    if (value.materialCode) {
      // Load existing selection
      await loadExistingSelection();
    }
  });

  async function loadMaterials() {
    try {
      // Load acrylic materials from local JSON (PLEXIGLAS)
      acrylicMaterials = plexiglasData;
      
      // Try to fetch from API if available
      try {
        const response = await fetch('/api/materials?category=ACRYLIC_XT,ACRYLIC_GS');
        if (response.ok) {
          const data = await response.json();
          // Use API data if available, otherwise keep JSON data
          if (data.items && data.items.length > 0) {
            acrylicMaterials = data.items;
          }
        }
      } catch (err) {
        // Fallback to local JSON data (already loaded)
        console.log('Using local PLEXIGLAS data');
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
    }
  }

  async function loadExistingSelection() {
    // Determine material type from code
    if (value.materialCode?.includes('PLEXIGLAS')) {
      selectedType = 'ACRYLIC';
      selectedMaterial = acrylicMaterials.find(m => m.code === value.materialCode);
    } else if (value.materialCode?.startsWith('ALU')) {
      selectedType = 'ALUMINUM';
    } else if (value.materialCode?.startsWith('PVC')) {
      selectedType = 'PVC';
    }
    thickness = value.thickness || null;
  }

  function selectMaterialType(type: 'ACRYLIC' | 'ALUMINUM' | 'PVC') {
    selectedType = type;
    selectedMaterial = null;
    thickness = null;
    updateValue();
  }

  function selectAcrylicMaterial(material: any) {
    selectedMaterial = material;
    value.materialCode = material.code;
    updateValue();
  }

  function selectThickness(t: number) {
    thickness = t;
    value.thickness = t;
    
    // For ALU and PVC, generate material code
    if (selectedType === 'ALUMINUM') {
      value.materialCode = `ALU_${t}`;
    } else if (selectedType === 'PVC') {
      value.materialCode = `PVC_WHITE_${t}`;
    } else if (selectedType === 'ACRYLIC' && selectedMaterial) {
      // Update thickness for acrylic
      value.thickness = t;
    }
    
    updateValue();
  }

  function updateValue() {
    value = { ...value };
  }

  function getMaterialBoxColor(): string {
    if (!selectedType) return '#E5E7EB';
    
    if (selectedType === 'ACRYLIC' && selectedMaterial) {
      // Return hex color from material data
      return selectedMaterial.hex || selectedMaterial.metadata?.hex || '#F5F5F0';
    } else if (selectedType === 'ALUMINUM') {
      return '#C0C0C0'; // Silver
    } else if (selectedType === 'PVC') {
      return '#FFFFFF'; // White
    }
    return '#E5E7EB';
  }

  function getMaterialDisplayText(): string {
    if (!selectedType) return 'Select Material';
    
    if (selectedType === 'ACRYLIC' && selectedMaterial) {
      // Show code like "WN071" or colored name
      const code = selectedMaterial.colorCode || selectedMaterial.code.replace('PLEXIGLAS_XT_', '').replace('PLEXIGLAS_GS_', '');
      return code;
    } else if (selectedType === 'ALUMINUM' && thickness) {
      return `ALU ${thickness}`;
    } else if (selectedType === 'PVC' && thickness) {
      return `PVC ${thickness}`;
    }
    return selectedType;
  }

  function getTextColor(bgHex: string): string {
    // Calculate luminance to determine if text should be white or black
    const hex = bgHex.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }
</script>

<div class="material-field">
  <label class="label">
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <!-- Step 1: Material Type Selection -->
  <div class="material-type-selector">
    {#each materialTypes as type}
      <button
        type="button"
        class="type-button"
        class:active={selectedType === type}
        on:click={() => selectMaterialType(type)}
        {disabled}
      >
        {#if type === 'ACRYLIC'}
          <span class="type-icon">🔲</span> Acrylic
        {:else if type === 'ALUMINUM'}
          <span class="type-icon">⚙️</span> Aluminum
        {:else if type === 'PVC'}
          <span class="type-icon">📦</span> PVC
        {/if}
      </button>
    {/each}
  </div>

  <!-- Step 2: Specific Material/Thickness Selection -->
  {#if selectedType}
    <div class="material-details">
      {#if selectedType === 'ACRYLIC'}
        <!-- Show PLEXIGLAS codes -->
        <div class="acrylic-grid">
          <p class="helper-text">Select PLEXIGLAS® code:</p>
          <div class="acrylic-options">
            {#each acrylicMaterials as material}
              <button
                type="button"
                class="acrylic-option"
                class:selected={selectedMaterial?.code === material.code}
                style="background-color: {material.hex}; border: 2px solid {selectedMaterial?.code === material.code ? '#000' : '#ccc'}; color: {getTextColor(material.hex)};"
                on:click={() => selectAcrylicMaterial(material)}
                title={material.colorName}
              >
                <span class="material-code">
                  {material.colorCode}
                </span>
                <span class="material-name">{material.colorName}</span>
              </button>
            {/each}
          </div>
          
          <!-- Thickness selection for acrylic -->
          {#if selectedMaterial}
            <div class="thickness-selector" style="margin-top: var(--space-md, 12px);">
              <p class="helper-text">Select thickness:</p>
              <div class="thickness-grid">
                {#each selectedMaterial.thicknessOptions || acrylicThicknesses as t}
                  <button
                    type="button"
                    class="thickness-option"
                    class:selected={thickness === t}
                    on:click={() => selectThickness(t)}
                  >
                    {t}mm
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      {:else if selectedType === 'ALUMINUM'}
        <!-- Show thickness selector -->
        <div class="thickness-selector">
          <p class="helper-text">Select thickness:</p>
          <div class="thickness-grid">
            {#each aluminumThicknesses as t}
              <button
                type="button"
                class="thickness-option"
                class:selected={thickness === t}
                on:click={() => selectThickness(t)}
              >
                {t}mm
              </button>
            {/each}
          </div>
          <input
            type="number"
            class="custom-thickness"
            placeholder="Custom..."
            step="0.1"
            min="0.5"
            max="5"
            on:change={(e) => {
              const val = parseFloat(e.currentTarget.value);
              if (!isNaN(val)) selectThickness(val);
            }}
          />
        </div>

      {:else if selectedType === 'PVC'}
        <!-- Show PVC thickness selector -->
        <div class="thickness-selector">
          <p class="helper-text">PVC White - Select thickness:</p>
          <div class="thickness-grid">
            {#each pvcThicknesses as t}
              <button
                type="button"
                class="thickness-option"
                class:selected={thickness === t}
                on:click={() => selectThickness(t)}
              >
                {t}mm
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Step 3: Visual Result Box (PDF Style) -->
  {#if selectedType && (selectedMaterial || thickness)}
    <div class="material-result-box">
      <div
        class="material-box"
        style="background-color: {getMaterialBoxColor()}; color: {getTextColor(getMaterialBoxColor())};"
      >
        <span class="material-display">{getMaterialDisplayText()}</span>
        {#if thickness}
          <span class="thickness-display">{thickness}mm</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .material-field {
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

  /* Type Selector */
  .material-type-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-sm, 8px);
  }

  .type-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs, 4px);
    padding: var(--space-md, 12px);
    background: var(--bg-2, #f9fafb);
    border: 2px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    font-weight: 600;
  }

  .type-button:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
    background: var(--bg-3, #f3f4f6);
  }

  .type-button.active {
    border-color: var(--primary, #3b82f6);
    background: var(--primary, #3b82f6);
    color: white;
  }

  .type-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .type-icon {
    font-size: var(--text-lg, 1.125rem);
  }

  /* Material Details */
  .material-details {
    padding: var(--space-md, 12px);
    background: var(--bg-2, #f9fafb);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border, #e5e7eb);
  }

  .helper-text {
    margin: 0 0 var(--space-sm, 8px) 0;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-muted, #6b7280);
  }

  /* Acrylic Grid */
  .acrylic-options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--space-sm, 8px);
  }

  .acrylic-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: var(--space-sm, 8px);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: 60px;
  }

  .acrylic-option:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .acrylic-option.selected {
    box-shadow: 0 0 0 3px var(--primary, #3b82f6);
  }

  .material-code {
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    font-size: var(--text-sm, 0.875rem);
  }

  .material-name {
    font-size: 10px;
    text-align: center;
    line-height: 1.2;
  }

  /* Thickness Selector */
  .thickness-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: var(--space-xs, 4px);
    margin-bottom: var(--space-sm, 8px);
  }

  .thickness-option {
    padding: var(--space-sm, 8px);
    background: var(--bg-1, #ffffff);
    border: 2px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    font-weight: 600;
  }

  .thickness-option:hover {
    border-color: var(--primary, #3b82f6);
  }

  .thickness-option.selected {
    background: var(--primary, #3b82f6);
    border-color: var(--primary, #3b82f6);
    color: white;
  }

  .custom-thickness {
    width: 100%;
    padding: var(--space-sm, 8px);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    font-size: var(--text-sm, 0.875rem);
  }

  /* Result Box (PDF Style) */
  .material-result-box {
    padding: var(--space-md, 12px);
    background: var(--bg-2, #f9fafb);
    border-radius: var(--radius-md, 6px);
  }

  .material-box {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    border: 2px solid #000;
    border-radius: var(--radius-sm, 4px);
    font-weight: 700;
    font-size: var(--text-md, 1rem);
    box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
  }

  .material-display {
    font-family: var(--font-mono, monospace);
  }

  .thickness-display {
    font-size: var(--text-xs, 0.75rem);
    opacity: 0.8;
  }
</style>
