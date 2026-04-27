<!-- src/lib/profiles/components/fields/MaterialField.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { derived } from 'svelte/store';
  import type { Material } from '$lib/profiles/types';
  import plexiglasData from '$lib/profiles/data/plexiglas-materials.json';

  interface Props {
    value?: {
      materialId?: number;
      materialCode?: string;
      thickness?: number;
      sectionSize?: string;
      diameter?: number;
    };
    label?: string;
    required?: boolean;
    disabled?: boolean;
    materialTypes?: Array<'ACRYLIC' | 'ALUMINUM' | 'PVC' | 'ALU_PROFILE'>;
  }

  let {
    value = $bindable({}),
    label = 'Material',
    required = false,
    disabled = false,
    materialTypes = ['ACRYLIC', 'ALUMINUM', 'PVC', 'ALU_PROFILE'],
  }: Props = $props();

  let selectedType: 'ACRYLIC' | 'ALUMINUM' | 'PVC' | 'ALU_PROFILE' | null = $state(null);
  let acrylicMaterials: any[] = $state([]);
  let aluminumMaterials: any[] = $state([]);
  let pvcMaterials: any[] = $state([]);
  let aluProfileMaterials: any[] = $state([]);
  let selectedMaterial: any | null = $state(null);
  let thickness: number | null = $state(null);
  let sectionSize: string | null = $state(null);
  let diameter: number | null = $state(null);

  let squareAluProfiles = $derived(
    aluProfileMaterials.filter(m => !m.name_en?.toLowerCase().includes('tube') && !m.name_en?.toLowerCase().includes('d'))
  );

  let roundAluProfiles = $derived(
    aluProfileMaterials.filter(m => m.name_en?.toLowerCase().includes('tube') || m.name_en?.toLowerCase().includes('d'))
  );

  const aluminumThicknesses = [1.0, 1.2, 1.3, 1.5, 2.0, 3.0];
  const pvcThicknesses = [3, 5, 8, 10, 12, 15, 18, 19];
  const acrylicThicknesses = [2, 3, 4, 5, 6, 8, 10];

  onMount(async () => {
    await loadMaterials();
    if (value.materialCode) {
      await loadExistingSelection();
    }
  });

  async function loadMaterials() {
    try {
      const response = await fetch('/api/materials');
      if (response.ok) {
        const data = await response.json();
        const allMaterials = Array.isArray(data) ? data : (data.items || []);
        acrylicMaterials = allMaterials.filter(m => m.category === 'ACRYLIC_XT' || m.category === 'ACRYLIC_GS');
        aluminumMaterials = allMaterials.filter(m => m.category === 'ALU_SHEET' || m.category === 'ALUMINUM');
        pvcMaterials = allMaterials.filter(m => m.category === 'PVC');
        aluProfileMaterials = allMaterials.filter(m => m.category === 'ALU_PROFILE');
      } else {
        acrylicMaterials = plexiglasData;
        console.warn('Using fallback data for materials');
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
      acrylicMaterials = plexiglasData;
    }
  }

  async function loadExistingSelection() {
    if (value.materialCode?.includes('PLEXIGLAS')) {
      selectedType = 'ACRYLIC';
      selectedMaterial = acrylicMaterials.find(m => m.code === value.materialCode);
    } else if (value.materialCode?.startsWith('ALU') && value.materialCode?.includes('PROFILE')) {
      selectedType = 'ALU_PROFILE';
      selectedMaterial = aluProfileMaterials.find(m => m.code === value.materialCode);
      sectionSize = value.sectionSize || null;
      diameter = value.diameter || null;
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
    diameter = null;
    updateValue();
  }

  function selectMaterial(material: any) {
    selectedMaterial = material;
    updateValue();
  }

  function selectThickness(t: number) {
    thickness = t;
    updateValue();
  }

  function selectSectionSize(size: string) {
    sectionSize = size;
    updateValue();
  }
  
  function selectDiameter(d: number) {
    diameter = d;
    updateValue();
  }

  function updateValue() {
    let newValue: any = {
      materialCode: selectedMaterial?.code,
      thickness,
      sectionSize,
      diameter,
    };
    value = newValue;
  }

  function getMaterialBoxColor(): string {
    if (!selectedType) return '#E5E7EB';
    if (selectedType === 'ACRYLIC' && selectedMaterial) {
      return selectedMaterial.hex || selectedMaterial.metadata?.hex || '#F5F5F0';
    } else if (selectedType === 'ALUMINUM') {
      return '#C0C0C0';
    } else if (selectedType === 'PVC') {
      return '#FFFFFF';
    } else if (selectedType === 'ALU_PROFILE') {
      return '#A9A9A9';
    }
    return '#E5E7EB';
  }

  function getMaterialDisplayText(): string {
    if (!selectedMaterial) return 'Select Material';

    const code = selectedMaterial.colorCode || selectedMaterial.code;

    if (selectedType === 'ACRYLIC') {
      return thickness ? `${code}/${thickness}mm` : code;
    }
    if (selectedType === 'ALUMINUM' || selectedType === 'PVC') {
      return thickness ? `${code}/${thickness}mm` : code;
    }
    if (selectedType === 'ALU_PROFILE') {
      if (sectionSize) return `${code}/${sectionSize}`;
      if (diameter) return `${code}/D${diameter}`;
      return code;
    }
    return selectedMaterial.name_en || code;
  }

  function getTextColor(bgHex: string): string {
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
    {#if required}<span class="required">*</span>{/if}
  </label>

  <div class="material-type-selector">
    {#each materialTypes as type}
      <button
        type="button"
        class="type-button"
        class:active={selectedType === type}
        onclick={() => selectMaterialType(type)}
        {disabled}
      >
        {#if type === 'ACRYLIC'} <span class="type-icon">🔲</span> Acrylic
        {:else if type === 'ALUMINUM'} <span class="type-icon">⚙️</span> Aluminum
        {:else if type === 'PVC'} <span class="type-icon">📦</span> PVC
        {:else if type === 'ALU_PROFILE'} <span class="type-icon">🔧</span> Alu Profile
        {/if}
      </button>
    {/each}
  </div>

  {#if selectedType}
    <div class="material-details">
      {#if selectedType === 'ACRYLIC'}
        <div class="acrylic-grid">
          <p class="helper-text">Select PLEXIGLAS® code:</p>
          <div class="acrylic-options">
            {#each acrylicMaterials as material}
              <button
                type="button"
                class="acrylic-option"
                class:selected={selectedMaterial?.code === material.code}
                style="background-color: {material.hex}; color: {getTextColor(material.hex)};"
                onclick={() => selectMaterial(material)}
                title={material.colorName}
              >
                <span class="material-code">{material.colorCode}</span>
                <span class="material-name">{material.colorName}</span>
              </button>
            {/each}
          </div>
          {#if selectedMaterial}
            <div class="thickness-selector">
              <p class="helper-text">Select thickness:</p>
              <div class="thickness-grid">
                {#each selectedMaterial.thickness_options || acrylicThicknesses as t}
                  <button type="button" class:selected={thickness === t} onclick={() => selectThickness(t)}>{t}mm</button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else if selectedType === 'ALUMINUM'}
        <div class="thickness-selector">
          <p class="helper-text">Select thickness:</p>
          <div class="thickness-grid">
            {#each aluminumThicknesses as t}
              <button type="button" class:selected={thickness === t} onclick={() => selectThickness(t)}>{t}mm</button>
            {/each}
          </div>
        </div>
      {:else if selectedType === 'PVC'}
        <div class="thickness-selector">
          <p class="helper-text">PVC White - Select thickness:</p>
          <div class="thickness-grid">
            {#each pvcThicknesses as t}
              <button type="button" class:selected={thickness === t} onclick={() => selectThickness(t)}>{t}mm</button>
            {/each}
          </div>
        </div>
      {:else if selectedType === 'ALU_PROFILE'}
        <div class="alu-profile-selector">
          <p class="helper-text">Select Square Profile:</p>
          <div class="size-grid">
            {#each squareAluProfiles as material}
              <button type="button" class="size-option" class:selected={selectedMaterial?.code === material.code} onclick={() => selectMaterial(material)}>{material.name_en}</button>
            {/each}
          </div>
          <div class="section-size-input">
            <label>Enter section size:</label>
            <input type="text" placeholder="e.g., 20x20" bind:value={sectionSize} oninput={updateValue}/>
          </div>
          <p class="helper-text">Select Round Profile (Tube):</p>
          <div class="size-grid">
            {#each roundAluProfiles as material}
              <button type="button" class="size-option" class:selected={selectedMaterial?.code === material.code} onclick={() => selectMaterial(material)}>{material.name_en}</button>
            {/each}
          </div>
          <div class="section-size-input">
            <label>Enter diameter (mm):</label>
            <input type="number" placeholder="e.g., 20" bind:value={diameter} oninput={updateValue}/>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if selectedMaterial}
    <div class="material-result-box">
      <div class="material-box" style="background-color: {getMaterialBoxColor()}; color: {getTextColor(getMaterialBoxColor())};">
        <span class="material-display">{getMaterialDisplayText()}</span>
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
    font-weight: 600;
  }
  .required {
    color: var(--danger, var(--error));
  }
  .material-type-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-sm, 8px);
  }
  .type-button {
    padding: var(--space-md, 12px);
    border: 2px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    background: var(--bg-2, var(--bg-2));
    font-weight: 600;
    cursor: pointer;
  }
  .type-button.active {
    border-color: var(--primary, var(--brand));
    background: var(--primary, var(--brand));
    color: var(--bg-0);
  }
  .material-details {
    padding: var(--space-md, 12px);
    background: var(--bg-2, var(--bg-2));
    border-radius: var(--radius-md, 6px);
  }
  .acrylic-options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--space-sm, 8px);
  }
  .acrylic-option {
    padding: var(--space-sm, 8px);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
  }
  .thickness-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: var(--space-xs, 4px);
  }
  .size-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-xs, 4px);
  }
  .size-option, .thickness-option {
    padding: var(--space-sm, 8px);
    border: 2px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
  }
  .size-option.selected, .thickness-option.selected, .acrylic-option.selected {
    border-color: var(--primary, var(--brand));
    box-shadow: 0 0 0 2px var(--primary, var(--brand));
  }
  .material-result-box {
    padding: var(--space-md, 12px);
    background: var(--bg-3, var(--bg-2));
    border-radius: var(--radius-md, 6px);
  }
  .material-box {
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    border-radius: var(--radius-sm, 4px);
    font-weight: 700;
    display: inline-block;
  }
</style>
