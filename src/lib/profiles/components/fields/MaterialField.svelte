<!-- src/lib/profiles/components/fields/MaterialField.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Material } from '$lib/profiles/types';
  import plexiglasData from '$lib/profiles/data/plexiglas-materials.json';

  
  interface Props {
    value?: {
    materialId?: number;
    materialCode?: string;
    thickness?: number;
    sectionSize?: string;
  };
    label?: string;
    required?: boolean;
    disabled?: boolean;
    materialTypes?: string[]; // Which material types to allow
  }

  let {
    value = $bindable({}),
    label = 'Material',
    required = false,
    disabled = false,
    materialTypes = ['ACRYLIC', 'ALUMINUM', 'PVC', 'ALU_PROFILE']
  }: Props = $props();

  let selectedType: 'ACRYLIC' | 'ALUMINUM' | 'PVC' | 'ALU_PROFILE' | null = $state(null);
  let acrylicMaterials: any[] = $state([]);
  let aluminumMaterials: any[] = $state([]);
  let pvcMaterials: any[] = $state([]);
  let aluProfileMaterials: any[] = $state([]);
  let selectedMaterial: any | null = $state(null);
  let thickness: number | null = $state(null);
  let sectionSize: string | null = $state(null); // For ALU_PROFILE

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
      // Load all material types from API
      const response = await fetch('/api/materials');
      if (response.ok) {
        const data = await response.json();
        const allMaterials = Array.isArray(data) ? data : (data.items || []);

        // Separate materials by category
        acrylicMaterials = allMaterials.filter(m => m.category === 'ACRYLIC_XT' || m.category === 'ACRYLIC_GS');
        aluminumMaterials = allMaterials.filter(m => m.category === 'ALU_SHEET' || m.category === 'ALUMINUM');
        pvcMaterials = allMaterials.filter(m => m.category === 'PVC');
        aluProfileMaterials = allMaterials.filter(m => m.category === 'ALU_PROFILE');
      } else {
        // Fallback to local JSON data for acrylic
        acrylicMaterials = plexiglasData;
        console.warn('Using fallback data for materials');
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
      // Fallback to local JSON data for acrylic
      acrylicMaterials = plexiglasData;
    }
  }

  async function loadExistingSelection() {
    // Determine material type from code
    if (value.materialCode?.includes('PLEXIGLAS')) {
      selectedType = 'ACRYLIC';
      selectedMaterial = acrylicMaterials.find(m => m.code === value.materialCode);
    } else if (value.materialCode?.startsWith('ALU') && value.materialCode?.includes('PROFILE')) {
      selectedType = 'ALU_PROFILE';
      selectedMaterial = aluProfileMaterials.find(m => m.code === value.materialCode);
      // For ALU_PROFILE, use sectionSize instead of thickness
      sectionSize = value.sectionSize || null;
    } else if (value.materialCode?.startsWith('ALU')) {
      selectedType = 'ALUMINUM';
      selectedMaterial = aluminumMaterials.find(m => m.code === value.materialCode);
    } else if (value.materialCode?.startsWith('PVC')) {
      selectedType = 'PVC';
      selectedMaterial = pvcMaterials.find(m => m.code === value.materialCode);
    }
    thickness = value.thickness || null;
  }

  function selectMaterialType(type: 'ACRYLIC' | 'ALUMINUM' | 'PVC' | 'ALU_PROFILE') {
    selectedType = type;
    selectedMaterial = null;
    thickness = null;
    sectionSize = null;
  }

  function selectAcrylicMaterial(material: any) {
    selectedMaterial = material;
    value = { ...value, materialCode: material.code };
  }

  function selectThickness(t: number) {
    thickness = t;
    value = { ...value, thickness: t };

    // For materials with selected material, use the material code
    if (selectedMaterial) {
      value = { ...value, materialCode: selectedMaterial.code };
    } 
    // For ALU and PVC without selected material, generate material code
    else if (selectedType === 'ALUMINUM') {
      value = { ...value, materialCode: `ALU_${t}` };
    } else if (selectedType === 'PVC') {
      value = { ...value, materialCode: `PVC_WHITE_${t}` };
    }
  }

  function selectSectionSize(size: string) {
    sectionSize = size;
    
    // For ALU_PROFILE, use the section size in material code
    if (selectedType === 'ALU_PROFILE' && selectedMaterial) {
      value = { ...value, sectionSize: size, materialCode: selectedMaterial.code };
    } else {
      value = { ...value, sectionSize: size };
    }
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
    } else if (selectedType === 'ALU_PROFILE') {
      return '#A9A9A9'; // Darker gray for profiles
    }
    return '#E5E7EB';
  }

  function getMaterialDisplayText(): string {
    if (!selectedType) return 'Select Material';

    if (selectedType === 'ACRYLIC' && selectedMaterial) {
      // Show code like "WN071" or colored name with thickness
      const code = selectedMaterial.colorCode || selectedMaterial.code.replace('PLEXIGLAS_XT_', '').replace('PLEXIGLAS_GS_', '');
      return thickness ? `${code}/${thickness}mm` : code;
    } else if (selectedType === 'ALUMINUM' && selectedMaterial && thickness) {
      return `${selectedMaterial.code || 'ALU'}/${thickness}mm`;
    } else if (selectedType === 'ALUMINUM' && thickness) {
      return `ALU/${thickness}mm`;
    } else if (selectedType === 'PVC' && selectedMaterial && thickness) {
      return `${selectedMaterial.code || 'PVC'}/${thickness}mm`;
    } else if (selectedType === 'PVC' && thickness) {
      return `PVC/${thickness}mm`;
    } else if (selectedType === 'ALU_PROFILE' && selectedMaterial) {
      // Show profile code or name
      return selectedMaterial.code || selectedMaterial.name_en || 'ALU_PROFILE';
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
        onclick={() => selectMaterialType(type)}
        {disabled}
      >
        {#if type === 'ACRYLIC'}
          <span class="type-icon">🔲</span> Acrylic
        {:else if type === 'ALUMINUM'}
          <span class="type-icon">⚙️</span> Aluminum
        {:else if type === 'PVC'}
          <span class="type-icon">📦</span> PVC
        {:else if type === 'ALU_PROFILE'}
          <span class="type-icon">🔧</span> Alu Profile
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
                onclick={() => selectAcrylicMaterial(material)}
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
                {#each selectedMaterial.thickness_options || selectedMaterial.thicknessOptions || acrylicThicknesses as t}
                  <button
                    type="button"
                    class="thickness-option"
                    class:selected={thickness === t}
                    onclick={() => selectThickness(t)}
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
            {#each aluminumMaterials as material}
              {#each material.thickness_options as t}
                <button
                  type="button"
                  class="thickness-option"
                  class:selected={thickness === t}
                  onclick={() => {
                    selectThickness(t);
                    selectedMaterial = material;
                    value = { ...value, materialCode: material.code };
                  }}
                >
                  {t}mm
                </button>
              {/each}
            {/each}
          </div>
          <input
            type="number"
            class="custom-thickness"
            placeholder="Custom..."
            step="0.1"
            min="0.5"
            max="5"
            onchange={(e) => {
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
            {#each pvcMaterials as material}
              {#each material.thickness_options as t}
                <button
                  type="button"
                  class="thickness-option"
                  class:selected={thickness === t}
                  onclick={() => {
                    selectThickness(t);
                    selectedMaterial = material;
                    value = { ...value, materialCode: material.code };
                  }}
                >
                  {t}mm
                </button>
              {/each}
            {/each}
          </div>
        </div>

      {:else if selectedType === 'ALU_PROFILE'}
        <!-- Show ALU_PROFILE section size selector -->
        <div class="alu-profile-selector">
          <p class="helper-text">Select profile size:</p>
          <div class="size-grid">
            {#each aluProfileMaterials as material}
              <button
                type="button"
                class="size-option"
                class:selected={selectedMaterial?.code === material.code}
                onclick={() => {
                  selectedMaterial = material;
                  value = { ...value, materialCode: material.code };
                  // Extract section size from material name if it contains size info
                  const sizeMatch = material.name_en.match(/(\d+x\d+)/i);
                  if (sizeMatch) {
                    selectSectionSize(sizeMatch[0]);
                  }
                }}
              >
                {material.name_en}
              </button>
            {/each}
          </div>
          
          <!-- Alternative manual input for section size -->
          <div class="section-size-input">
            <label>Or enter custom section size:</label>
            <input
              type="text"
              class="custom-section-size"
              placeholder="e.g., 20x20, 40x40, 60x40"
              value={sectionSize || ''}
              oninput={(e) => selectSectionSize(e.currentTarget.value)}
            />
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Step 3: Visual Result Box (PDF Style) -->
  {#if selectedType && (selectedMaterial || thickness || sectionSize)}
    <div class="material-result-box">
      <div
        class="material-box"
        style="background-color: {getMaterialBoxColor()}; color: {getTextColor(getMaterialBoxColor())};"
      >
        <span class="material-display">{getMaterialDisplayText()}</span>
        {#if selectedType === 'ALU_PROFILE' && sectionSize}
          <span class="section-size-display">{sectionSize}</span>
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

  /* ALU Profile Selector */
  .alu-profile-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
  }

  .size-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-xs, 4px);
    margin-bottom: var(--space-sm, 8px);
  }

  .size-option {
    padding: var(--space-sm, 8px);
    background: var(--bg-1, #ffffff);
    border: 2px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: var(--text-xs, 0.75rem);
    text-align: center;
  }

  .size-option:hover {
    border-color: var(--primary, #3b82f6);
  }

  .size-option.selected {
    background: var(--primary, #3b82f6);
    border-color: var(--primary, #3b82f6);
    color: white;
  }

  .section-size-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .custom-section-size {
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
  
  .section-size-display {
    font-size: var(--text-xs, 0.75rem);
    opacity: 0.8;
    background: var(--primary, #3b82f6);
    color: white;
    padding: 2px 6px;
    border-radius: var(--radius-full, 9999px);
  }
</style>
