<script lang="ts">
  import { onMount } from 'svelte';
  import { materials, loadMaterials, getLowStockMaterials } from '$lib/inventory/store';
  import { Package, Plus, Search, AlertCircle } from 'lucide-svelte';
  import { t } from 'svelte-i18n';
  import type { Category } from '$lib/inventory/types';

  let searchQuery = $state('');
  let categoryFilter: Category | 'ALL' = $state('ALL');
  let showLowStockOnly = $state(false);
  let materialList = $state<any[]>([]);
  let lowStockList = $state<any[]>([]);

  onMount(() => {
    loadMaterials().then(data => materialList = data);
  });

  // Subscribe to store updates
  onMount(() => {
    const unsubMaterials = materials.subscribe(value => {
      materialList = value;
      lowStockList = getLowStockMaterials();
    });
    lowStockList = getLowStockMaterials();
    return () => unsubMaterials();
  });

  let filteredMaterials = $derived(materialList.filter(mat => {
    const matchesSearch = (mat.name_en || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         mat.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || mat.category === categoryFilter;
    const matchesLowStock = !showLowStockOnly || mat.stock <= mat.min_stock;

    return matchesSearch && matchesCategory && matchesLowStock;
  }));
</script>

<svelte:head>
  <title>Material Catalog - Reclame OMS</title>
</svelte:head>

<section class="page-container">
  <div class="page-header">
    <div class="header-title">
      <Package size={24} />
      <h1>{$t('inventory.catalog') || 'Material Catalog'}</h1>
    </div>
    <button class="btn primary" onclick={() => {/* Open add material modal */}}>
      <Plus size={16} />
      {$t('inventory.add_material') || 'Add Material'}
    </button>
  </div>
  
  {#if lowStockList.length > 0}
    <div class="alert-banner">
      <AlertCircle size={20} />
      <span>{lowStockList.length} {$t('inventory.low_stock_items') || 'materials low in stock'}</span>
      <button class="btn sm" onclick={() => showLowStockOnly = !showLowStockOnly}>
        {showLowStockOnly ? ($t('inventory.show_all') || 'Show All') : ($t('inventory.show_alerts') || 'Show Alerts Only')}
      </button>
    </div>
  {/if}
  
  <div class="filters-bar">
    <div class="search-box">
      <Search size={16} />
      <input 
        bind:value={searchQuery} 
        placeholder={$t('inventory.search_materials') || 'Search materials...'}
      />
    </div>
    
    <select bind:value={categoryFilter}>
      <option value="ALL">{$t('inventory.all_categories') || 'All Categories'}</option>
      <optgroup label="Acrylics">
        <option value="ACRYLIC_XT">Acrylic XT</option>
        <option value="ACRYLIC_GS">Acrylic GS</option>
        <option value="ACRYLIC_LED">Acrylic LED</option>
        <option value="ACRYLIC_SPECIAL">Acrylic Special</option>
      </optgroup>
      <optgroup label="Metals">
        <option value="ALU_SHEET">Alu Sheet</option>
        <option value="ALU_COMPOSITE">Alu Composite (ACP)</option>
        <option value="ALU_PROFILE">Alu Profile</option>
        <option value="STEEL">Steel / Stainless</option>
      </optgroup>
      <optgroup label="Films & Vinyl">
        <option value="VINYL_ORACAL">Vinyl Oracal</option>
        <option value="VINYL_SPECIAL">Vinyl Special</option>
      </optgroup>
      <optgroup label="Paints">
        <option value="PAINT_RAL">Paint RAL</option>
        <option value="PAINT_PANTONE">Paint Pantone</option>
      </optgroup>
      <optgroup label="Electronics">
        <option value="LED_MODULE">LED Module</option>
        <option value="LED_STRIP">LED Strip</option>
        <option value="PSU_MEANWELL">Power Supply</option>
        <option value="WIRE">Wire / Cable</option>
      </optgroup>
      <optgroup label="Other">
        <option value="PVC_FOAM">PVC Foam (Forex)</option>
        <option value="HARDWARE">Hardware</option>
        <option value="CONSUMABLE">Consumables</option>
        <option value="3D_PRINTING">3D Printing</option>
      </optgroup>
    </select>
  </div>
  
  <div class="materials-grid">
    {#each filteredMaterials as material (material.id)}
      <div class="material-card">
        <div class="material-image-placeholder">
          <Package size={32} />
        </div>
        
        <div class="material-info">
          <h3>{material.name_en || material.code}</h3>
          <div class="material-brand">{material.sku}</div>

          <div class="material-specs">
            {#if material.thickness_mm}
              <span class="spec-tag">{material.thickness_mm}mm</span>
            {/if}
            <span class="spec-tag">{material.category}</span>
          </div>

          <div class="stock-info">
            <span class="stock-label">{$t('inventory.in_stock') || 'In Stock'}:</span>
            <span class="stock-value">
              {material.stock} {material.unit}
            </span>
          </div>

          {#if material.stock <= material.min_stock}
            <div class="low-stock-badge">
              <AlertCircle size={14} />
              {$t('inventory.low_stock') || 'Low Stock'}
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="empty-state">
        <Package size={48} />
        <p>No materials found</p>
        {#if searchQuery || categoryFilter !== 'ALL'}
          <button class="btn ghost" onclick={() => { searchQuery = ''; categoryFilter = 'ALL'; }}>
            Clear Filters
          </button>
        {/if}
      </div>
    {/each}
  </div>
</section>

<style>
  .page-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px;
  }
  
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .header-title h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
  }
  
  .alert-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: color-mix(in srgb, orange 15%, transparent);
    border: 1px solid orange;
    border-radius: 8px;
    margin-bottom: 16px;
    color: orange;
  }
  
  .filters-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }
  
  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  
  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 14px;
  }
  
  .search-box input:focus {
    outline: none;
  }
  
  select {
    padding: 8px 12px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
  }
  
  .materials-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
  
  .material-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.2s ease;
    cursor: pointer;
  }
  
  .material-card:hover {
    border-color: var(--accent, #3b82f6);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  
  .material-image,
  .material-image-placeholder {
    width: 100%;
    height: 160px;
    object-fit: cover;
    background: var(--bg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-2);
  }
  
  .material-info {
    padding: 16px;
  }
  
  .material-info h3 {
    margin: 0 0 4px 0;
    font-size: 1rem;
    color: var(--text);
  }
  
  .material-brand {
    font-size: 0.85rem;
    color: var(--text-2);
    margin-bottom: 12px;
  }
  
  .material-specs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  
  .spec-tag {
    padding: 2px 8px;
    background: var(--bg-2);
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-2);
  }
  
  .spec-tag.weather {
    background: color-mix(in srgb, green 15%, transparent);
    color: green;
  }
  
  .stock-info {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-top: 1px solid var(--border);
    font-size: 0.9rem;
  }
  
  .stock-label {
    color: var(--text-2);
  }
  
  .stock-value {
    font-weight: 600;
    color: var(--text);
  }
  
  .low-stock-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: color-mix(in srgb, red 15%, transparent);
    color: red;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 8px;
  }
  
  .empty-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--text-2);
    gap: 16px;
  }
  
  .empty-state p {
    margin: 0;
    font-size: 1.1rem;
  }
  
  .btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  
  .btn.primary {
    background: var(--accent, #3b82f6);
    color: white;
    border: none;
  }
  
  .btn.primary:hover {
    background: var(--accent-hover, #2563eb);
  }
  
  .btn.sm {
    padding: 6px 12px;
    font-size: 12px;
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
