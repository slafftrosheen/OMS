<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { base } from '$app/paths';
  import { currentUser } from '$lib/auth/user-store';
  import { Package, Plus, Edit2, Trash2, Search, X, Check, AlertCircle, ChevronDown } from 'lucide-svelte';

  interface Material {
    id: number;
    category: string;
    code: string;
    name_en: string;
    name_ru: string;
    name_lv: string;
    thickness_options: number[];
    metadata: {
      hex?: string;
      brand?: string;
      colorCode?: string;
      type?: string;
      transparent?: boolean;
      translucent?: boolean;
      transmittance?: string;
    };
    created_at: string;
  }

  let materials: Material[] = [];
  let loading = true;
  let error = '';
  let searchQuery = '';
  let categoryFilter = '';
  let successMessage = '';

  // Modal state
  let showModal = false;
  let modalMode: 'create' | 'edit' = 'create';
  let editingMaterial: Material | null = null;
  let saving = false;
  let modalError = '';

  // Form data
  let formData = {
    category: '',
    code: '',
    nameEn: '',
    nameRu: '',
    nameLv: '',
    thicknessOptions: '',
    hex: '',
    brand: '',
    colorCode: '',
    type: '',
    transmittance: '',
    // Electronics fields
    voltage: '',
    wattage: '',
    colorTemp: '',
    ledCount: '',
    length: '',
    ipRating: '',
    // Size fields
    width: '',
    height: '',
    diameter: '',
    weight: '',
    // Packaging
    packSize: '',
    minOrder: ''
  };

  const categories = [
    // Acrylics
    { value: 'ACRYLIC_XT', label: 'Acrylic XT (Extruded)' },
    { value: 'ACRYLIC_GS', label: 'Acrylic GS (Cast)' },
    { value: 'ACRYLIC_LED', label: 'Acrylic LED' },
    { value: 'ACRYLIC_MIRROR', label: 'Acrylic Mirror' },
    { value: 'ACRYLIC_SPECIAL', label: 'Acrylic Special Effects' },
    // Metals
    { value: 'ALU_SHEET', label: 'Aluminium Sheet' },
    { value: 'ALU_COMPOSITE', label: 'Aluminium Composite (Dibond)' },
    { value: 'ALU_PROFILE', label: 'Aluminium Profile' },
    { value: 'STEEL', label: 'Steel' },
    { value: 'STAINLESS', label: 'Stainless Steel' },
    { value: 'BRASS', label: 'Brass' },
    // Plastics
    { value: 'PVC_FOAM', label: 'PVC Foam (Forex)' },
    { value: 'POLYCARBONATE', label: 'Polycarbonate' },
    { value: 'PETG', label: 'PETG' },
    { value: 'HIPS', label: 'HIPS' },
    // Vinyl & Films
    { value: 'VINYL_ORACAL', label: 'Vinyl - Oracal' },
    { value: 'VINYL_3M', label: 'Vinyl - 3M' },
    { value: 'VINYL_AVERY', label: 'Vinyl - Avery' },
    { value: 'VINYL_OTHER', label: 'Vinyl - Other' },
    { value: 'LAMINATE', label: 'Laminate Film' },
    // Paints
    { value: 'PAINT_RAL', label: 'Paint - RAL Colors' },
    { value: 'PAINT_PANTONE', label: 'Paint - Pantone Colors' },
    { value: 'PAINT_AUTOMOTIVE', label: 'Paint - Automotive' },
    { value: 'PAINT_SPRAY', label: 'Paint - Spray Cans' },
    { value: 'PRIMER', label: 'Primer & Base Coats' },
    { value: 'CLEARCOAT', label: 'Clear Coat & Finish' },
    // Electronics
    { value: 'LED_MODULE', label: 'LED Modules' },
    { value: 'LED_STRIP', label: 'LED Strips' },
    { value: 'LED_NEON', label: 'LED Neon Flex' },
    { value: 'PSU', label: 'Power Supplies (PSU)' },
    { value: 'PSU_MEANWELL', label: 'Power Supplies - MeanWell' },
    { value: 'CONTROLLER', label: 'Controllers & Dimmers' },
    { value: 'WIRING', label: 'Wiring & Connectors' },
    { value: 'WIRE', label: 'Wire Cables' },
    { value: 'LED_ACCESSORY', label: 'LED Accessories' },
    // Hardware & Mounting
    { value: 'SCREWS', label: 'Screws & Bolts' },
    { value: 'ANCHORS', label: 'Anchors & Fixings' },
    { value: 'BRACKETS', label: 'Brackets & Mounts' },
    { value: 'STANDOFFS', label: 'Standoffs & Spacers' },
    { value: 'ADHESIVE', label: 'Adhesives & Tapes' },
    { value: 'SEALANT', label: 'Sealants & Silicone' },
    // 3D Printing
    { value: 'RESIN_ANYCUBIC', label: 'Resin - Anycubic' },
    { value: 'RESIN_ELEGOO', label: 'Resin - Elegoo' },
    { value: 'RESIN_OTHER', label: 'Resin - Other' },
    { value: 'FDM_PLA', label: 'FDM Filament - PLA' },
    { value: 'FDM_PETG', label: 'FDM Filament - PETG' },
    { value: 'FDM_ABS', label: 'FDM Filament - ABS' },
    { value: 'FDM_ASA', label: 'FDM Filament - ASA' },
    { value: 'FDM_TPU', label: 'FDM Filament - TPU' },
    { value: 'FDM_OTHER', label: 'FDM Filament - Other' },
    // Consumables
    { value: 'CONSUMABLE', label: 'Consumables' },
    { value: 'TOOL', label: 'Tools' },
    { value: 'SAFETY', label: 'Safety Equipment' },
    { value: 'PACKAGING', label: 'Packaging Materials' },
    // Other
    { value: 'WOOD', label: 'Wood & MDF' },
    { value: 'FOAM', label: 'Foam & Insulation' },
    { value: 'FABRIC', label: 'Fabric & Textile' },
    { value: 'OTHER', label: 'Other' }
  ];

  // Category groups for conditional fields
  const electronicsCategories = ['LED_MODULE', 'LED_STRIP', 'LED_NEON', 'PSU', 'PSU_MEANWELL', 'CONTROLLER', 'WIRING', 'WIRE', 'LED_ACCESSORY'];
  const paintCategories = ['PAINT_RAL', 'PAINT_PANTONE', 'PAINT_AUTOMOTIVE', 'PAINT_SPRAY', 'PRIMER', 'CLEARCOAT'];
  const sheetCategories = ['ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'ACRYLIC_MIRROR', 'ACRYLIC_SPECIAL', 'ALU_SHEET', 'ALU_COMPOSITE', 'STEEL', 'STAINLESS', 'BRASS', 'PVC_FOAM', 'POLYCARBONATE', 'PETG', 'HIPS', 'WOOD'];
  const filamentCategories = ['RESIN_ANYCUBIC', 'RESIN_ELEGOO', 'RESIN_OTHER', 'FDM_PLA', 'FDM_PETG', 'FDM_ABS', 'FDM_ASA', 'FDM_TPU', 'FDM_OTHER'];
  const hardwareCategories = ['SCREWS', 'ANCHORS', 'BRACKETS', 'STANDOFFS', 'ADHESIVE', 'SEALANT'];

  $: isElectronics = electronicsCategories.includes(formData.category);
  $: isPaint = paintCategories.includes(formData.category);
  $: isSheet = sheetCategories.includes(formData.category);
  $: isFilament = filamentCategories.includes(formData.category);
  $: isHardware = hardwareCategories.includes(formData.category);

  $: canManage = $currentUser?.roles?.Admin === 'SuperAdmin';

  $: filteredMaterials = materials.filter(m => {
    const matchesSearch = searchQuery === '' ||
      m.name_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === '' || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  $: groupedMaterials = filteredMaterials.reduce((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {} as Record<string, Material[]>);

  onMount(async () => {
    await loadMaterials();
  });

  async function loadMaterials() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`${base}/api/materials`);
      if (res.ok) {
        materials = await res.json();
      } else {
        error = 'Failed to load materials';
      }
    } catch (e) {
      error = 'Failed to connect to server';
    } finally {
      loading = false;
    }
  }

  function openCreateModal() {
    modalMode = 'create';
    editingMaterial = null;
    formData = {
      category: 'ACRYLIC_XT',
      code: '',
      nameEn: '',
      nameRu: '',
      nameLv: '',
      thicknessOptions: '2, 3, 4, 5, 6, 8, 10',
      hex: '#FFFFFF',
      brand: '',
      colorCode: '',
      type: '',
      transmittance: '',
      voltage: '',
      wattage: '',
      colorTemp: '',
      ledCount: '',
      length: '',
      ipRating: '',
      width: '',
      height: '',
      diameter: '',
      weight: '',
      packSize: '',
      minOrder: ''
    };
    modalError = '';
    showModal = true;
  }

  function openEditModal(material: Material) {
    modalMode = 'edit';
    editingMaterial = material;
    formData = {
      category: material.category,
      code: material.code,
      nameEn: material.name_en || '',
      nameRu: material.name_ru || '',
      nameLv: material.name_lv || '',
      thicknessOptions: material.thickness_options?.join(', ') || '',
      hex: material.metadata?.hex || '#FFFFFF',
      brand: material.metadata?.brand || '',
      colorCode: material.metadata?.colorCode || '',
      type: material.metadata?.type || '',
      transmittance: material.metadata?.transmittance || '',
      voltage: material.metadata?.voltage || '',
      wattage: material.metadata?.wattage || '',
      colorTemp: material.metadata?.colorTemp || '',
      ledCount: material.metadata?.ledCount || '',
      length: material.metadata?.length || '',
      ipRating: material.metadata?.ipRating || '',
      width: material.metadata?.width || '',
      height: material.metadata?.height || '',
      diameter: material.metadata?.diameter || '',
      weight: material.metadata?.weight || '',
      packSize: material.metadata?.packSize || '',
      minOrder: material.metadata?.minOrder || ''
    };
    modalError = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingMaterial = null;
    modalError = '';
  }

  async function saveMaterial() {
    if (!formData.code || !formData.category) {
      modalError = 'Code and category are required';
      return;
    }

    saving = true;
    modalError = '';

    const thicknessArr = formData.thicknessOptions
      .split(',')
      .map(t => parseFloat(t.trim()))
      .filter(t => !isNaN(t));

    const payload = {
      category: formData.category,
      code: formData.code,
      nameEn: formData.nameEn || null,
      nameRu: formData.nameRu || null,
      nameLv: formData.nameLv || null,
      thicknessOptions: thicknessArr,
      metadata: {
        hex: formData.hex || undefined,
        brand: formData.brand || undefined,
        colorCode: formData.colorCode || undefined,
        type: formData.type || undefined,
        transmittance: formData.transmittance || undefined,
        voltage: formData.voltage || undefined,
        wattage: formData.wattage || undefined,
        colorTemp: formData.colorTemp || undefined,
        ledCount: formData.ledCount || undefined,
        length: formData.length || undefined,
        ipRating: formData.ipRating || undefined,
        width: formData.width || undefined,
        height: formData.height || undefined,
        diameter: formData.diameter || undefined,
        weight: formData.weight || undefined,
        packSize: formData.packSize || undefined,
        minOrder: formData.minOrder || undefined
      }
    };

    try {
      const url = modalMode === 'create'
        ? `${base}/api/materials`
        : `${base}/api/materials/${editingMaterial!.id}`;
      
      const res = await fetch(url, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        successMessage = modalMode === 'create' ? 'Material created' : 'Material updated';
        closeModal();
        await loadMaterials();
      } else {
        const data = await res.json();
        modalError = data.error || 'Failed to save material';
      }
    } catch (e) {
      modalError = 'Failed to connect to server';
    } finally {
      saving = false;
    }

    setTimeout(() => successMessage = '', 3000);
  }

  async function deleteMaterial(material: Material) {
    if (!confirm(`Delete "${material.name_en || material.code}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${base}/api/materials/${material.id}`, { method: 'DELETE' });
      if (res.ok) {
        successMessage = 'Material deleted';
        await loadMaterials();
      } else {
        const data = await res.json();
        error = data.error || 'Failed to delete material';
      }
    } catch (e) {
      error = 'Failed to connect to server';
    }

    setTimeout(() => { successMessage = ''; error = ''; }, 3000);
  }

  function getCategoryLabel(cat: string): string {
    return categories.find(c => c.value === cat)?.label || cat;
  }

  function getColorPreview(material: Material): string {
    return material.metadata?.hex || '#888888';
  }
</script>

<svelte:head>
  <title>Materials Catalog - Admin</title>
</svelte:head>

<div class="materials-page">
  <header class="page-header">
    <div>
      <h1><Package size={28} /> Materials Catalog</h1>
      <p class="subtitle">Manage material definitions and specifications</p>
    </div>
    {#if canManage}
      <button class="btn-primary" on:click={openCreateModal}>
        <Plus size={18} />
        Add Material
      </button>
    {/if}
  </header>

  {#if successMessage}
    <div class="alert alert-success">
      <Check size={18} />
      {successMessage}
    </div>
  {/if}

  {#if error}
    <div class="alert alert-error">
      <AlertCircle size={18} />
      {error}
    </div>
  {/if}

  <div class="controls">
    <div class="search-box">
      <Search size={18} />
      <input type="text" placeholder="Search materials..." bind:value={searchQuery} />
    </div>
    <select bind:value={categoryFilter}>
      <option value="">All Categories</option>
      {#each categories as cat}
        <option value={cat.value}>{cat.label}</option>
      {/each}
    </select>
  </div>

  {#if loading}
    <div class="loading">Loading materials...</div>
  {:else if Object.keys(groupedMaterials).length === 0}
    <div class="empty-state">
      <Package size={48} />
      <p>No materials found</p>
    </div>
  {:else}
    {#each Object.entries(groupedMaterials) as [category, items]}
      <div class="category-section">
        <h2 class="category-header">
          <ChevronDown size={20} />
          {getCategoryLabel(category)}
          <span class="count">{items.length}</span>
        </h2>
        <div class="materials-grid">
          {#each items as material}
            <div class="material-card">
              <div class="material-color" style="background-color: {getColorPreview(material)}"></div>
              <div class="material-info">
                <h3>{material.name_en || material.code}</h3>
                <div class="material-code">{material.code}</div>
                {#if material.metadata?.brand}
                  <div class="material-brand">{material.metadata.brand}</div>
                {/if}
                {#if material.thickness_options?.length > 0}
                  <div class="thickness-tags">
                    {#each material.thickness_options.slice(0, 5) as t}
                      <span class="thickness-tag">{t}mm</span>
                    {/each}
                    {#if material.thickness_options.length > 5}
                      <span class="thickness-tag more">+{material.thickness_options.length - 5}</span>
                    {/if}
                  </div>
                {/if}
                {#if material.metadata?.transmittance}
                  <div class="transmittance">Light: {material.metadata.transmittance}</div>
                {/if}
              </div>
              {#if canManage}
                <div class="material-actions">
                  <button class="btn-icon" title="Edit" on:click={() => openEditModal(material)}>
                    <Edit2 size={16} />
                  </button>
                  <button class="btn-icon btn-danger" title="Delete" on:click={() => deleteMaterial(material)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<!-- Modal -->
{#if showModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={closeModal}>
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>{modalMode === 'create' ? 'Add Material' : 'Edit Material'}</h2>
        <button class="btn-close" on:click={closeModal}><X size={20} /></button>
      </div>

      {#if modalError}
        <div class="alert alert-error modal-alert">
          <AlertCircle size={18} />
          {modalError}
        </div>
      {/if}

      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label for="category">Category</label>
            <select id="category" bind:value={formData.category}>
              {#each categories as cat}
                <option value={cat.value}>{cat.label}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="code">Code</label>
            <input type="text" id="code" bind:value={formData.code} placeholder="e.g. PLEXIGLAS_XT_0F00" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="name-en">Name (English)</label>
            <input type="text" id="name-en" bind:value={formData.nameEn} placeholder="Material name" />
          </div>
          <div class="form-group">
            <label for="brand">Brand</label>
            <input type="text" id="brand" bind:value={formData.brand} placeholder="e.g. PLEXIGLAS®" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="name-ru">Name (Russian)</label>
            <input type="text" id="name-ru" bind:value={formData.nameRu} placeholder="Название материала" />
          </div>
          <div class="form-group">
            <label for="name-lv">Name (Latvian)</label>
            <input type="text" id="name-lv" bind:value={formData.nameLv} placeholder="Materiāla nosaukums" />
          </div>
        </div>

        <!-- Sheet materials: thickness -->
        {#if isSheet}
          <div class="form-group">
            <label for="thickness">Thickness Options (mm, comma-separated)</label>
            <input type="text" id="thickness" bind:value={formData.thicknessOptions} placeholder="2, 3, 4, 5, 6, 8, 10" />
          </div>
        {/if}

        <!-- Color fields (for most materials) -->
        <div class="form-row">
          <div class="form-group">
            <label for="hex">Color (HEX)</label>
            <div class="color-input">
              <input type="color" bind:value={formData.hex} />
              <input type="text" id="hex" bind:value={formData.hex} placeholder="#FFFFFF" />
            </div>
          </div>
          <div class="form-group">
            <label for="color-code">Color Code</label>
            <input type="text" id="color-code" bind:value={formData.colorCode} placeholder="e.g. 0F00, RAL 9010" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="type">Type</label>
            <input type="text" id="type" bind:value={formData.type} placeholder="e.g. extruded, cast, matte, gloss" />
          </div>
          {#if isSheet}
            <div class="form-group">
              <label for="transmittance">Light Transmittance</label>
              <input type="text" id="transmittance" bind:value={formData.transmittance} placeholder="e.g. 92%" />
            </div>
          {/if}
        </div>

        <!-- Electronics fields -->
        {#if isElectronics}
          <div class="form-section">
            <h3 class="section-title">Electronics Specifications</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="voltage">Voltage (V)</label>
                <input type="text" id="voltage" bind:value={formData.voltage} placeholder="e.g. 12V, 24V, 220V" />
              </div>
              <div class="form-group">
                <label for="wattage">Wattage (W)</label>
                <input type="text" id="wattage" bind:value={formData.wattage} placeholder="e.g. 14.4W/m, 100W" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="colorTemp">Color Temperature</label>
                <input type="text" id="colorTemp" bind:value={formData.colorTemp} placeholder="e.g. 3000K, 4000K, 6500K, RGB" />
              </div>
              <div class="form-group">
                <label for="ipRating">IP Rating</label>
                <input type="text" id="ipRating" bind:value={formData.ipRating} placeholder="e.g. IP20, IP65, IP68" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="ledCount">LED Count</label>
                <input type="text" id="ledCount" bind:value={formData.ledCount} placeholder="e.g. 60/m, 120/m" />
              </div>
              <div class="form-group">
                <label for="length">Length</label>
                <input type="text" id="length" bind:value={formData.length} placeholder="e.g. 5m, 1m" />
              </div>
            </div>
          </div>
        {/if}

        <!-- Filament fields -->
        {#if isFilament}
          <div class="form-section">
            <h3 class="section-title">Filament/Resin Specifications</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="diameter">Diameter</label>
                <input type="text" id="diameter" bind:value={formData.diameter} placeholder="e.g. 1.75mm, 2.85mm" />
              </div>
              <div class="form-group">
                <label for="weight">Weight</label>
                <input type="text" id="weight" bind:value={formData.weight} placeholder="e.g. 1kg, 500g, 1000ml" />
              </div>
            </div>
          </div>
        {/if}

        <!-- Hardware fields -->
        {#if isHardware}
          <div class="form-section">
            <h3 class="section-title">Hardware Specifications</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="length">Length/Size</label>
                <input type="text" id="length" bind:value={formData.length} placeholder="e.g. M4x20, 6x40mm" />
              </div>
              <div class="form-group">
                <label for="packSize">Pack Size</label>
                <input type="text" id="packSize" bind:value={formData.packSize} placeholder="e.g. 100pcs, 50pcs" />
              </div>
            </div>
          </div>
        {/if}

        <!-- Dimensions (for various materials) -->
        <div class="form-section">
          <h3 class="section-title">Dimensions & Packaging</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="width">Width</label>
              <input type="text" id="width" bind:value={formData.width} placeholder="e.g. 1000mm, 1220mm" />
            </div>
            <div class="form-group">
              <label for="height">Height/Length</label>
              <input type="text" id="height" bind:value={formData.height} placeholder="e.g. 2000mm, 50m" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="minOrder">Min Order Qty</label>
              <input type="text" id="minOrder" bind:value={formData.minOrder} placeholder="e.g. 1, 10, 100" />
            </div>
            {#if !isHardware}
              <div class="form-group">
                <label for="packSize2">Pack Size</label>
                <input type="text" id="packSize2" bind:value={formData.packSize} placeholder="e.g. 1 sheet, 1 roll" />
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModal} disabled={saving}>Cancel</button>
        <button class="btn-primary" on:click={saveMaterial} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .materials-page {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  h1 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
  }

  .subtitle {
    margin: 4px 0 0 0;
    color: var(--text-2);
    font-size: 14px;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--accent, #3b82f6);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) { background: var(--accent-hover, #2563eb); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-secondary {
    padding: 10px 16px;
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 14px;
  }

  .alert-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

  .controls {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    flex: 1;
    max-width: 300px;
  }

  .search-box input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 14px;
    color: var(--text);
    width: 100%;
  }

  select {
    padding: 8px 12px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 14px;
  }

  .loading, .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-2);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .category-section {
    margin-bottom: 32px;
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  .category-header .count {
    padding: 2px 8px;
    background: var(--bg-2);
    border-radius: 12px;
    font-size: 12px;
    color: var(--text-2);
  }

  .materials-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .material-card {
    display: flex;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .material-card:hover {
    border-color: var(--accent, #3b82f6);
  }

  .material-color {
    width: 8px;
    flex-shrink: 0;
  }

  .material-info {
    flex: 1;
    padding: 12px 16px;
    min-width: 0;
  }

  .material-info h3 {
    margin: 0 0 4px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .material-code {
    font-size: 11px;
    color: var(--text-2);
    font-family: monospace;
    margin-bottom: 4px;
  }

  .material-brand {
    font-size: 12px;
    color: var(--text-2);
    margin-bottom: 8px;
  }

  .thickness-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }

  .thickness-tag {
    padding: 2px 6px;
    background: var(--bg-2);
    border-radius: 4px;
    font-size: 10px;
    color: var(--text-2);
  }

  .thickness-tag.more {
    background: var(--accent, #3b82f6);
    color: white;
  }

  .transmittance {
    font-size: 11px;
    color: var(--text-2);
  }

  .material-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border-left: 1px solid var(--border);
  }

  .btn-icon {
    padding: 6px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-2);
  }

  .btn-icon:hover { background: var(--bg-2); color: var(--text); }
  .btn-icon.btn-danger:hover { background: #fee2e2; color: #991b1b; border-color: #fecaca; }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal {
    background: var(--bg-1);
    border-radius: 12px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 { margin: 0; font-size: 18px; }

  .btn-close {
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-2);
  }

  .modal-alert { margin: 16px 24px 0; }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--border);
  }

  .form-group { margin-bottom: 16px; }
  .form-group:last-child { margin-bottom: 0; }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }

  .form-group input, .form-group select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    background: var(--bg-0);
    color: var(--text);
  }

  .form-group input:focus, .form-group select:focus {
    outline: none;
    border-color: var(--accent, #3b82f6);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .color-input {
    display: flex;
    gap: 8px;
  }

  .color-input input[type="color"] {
    width: 48px;
    height: 38px;
    padding: 2px;
    cursor: pointer;
  }

  .color-input input[type="text"] {
    flex: 1;
  }

  .form-section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .section-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @media (max-width: 640px) {
    .form-row { grid-template-columns: 1fr; }
    .controls { flex-direction: column; }
    .search-box { max-width: none; }
  }
</style>
