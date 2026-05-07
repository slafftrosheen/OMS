<script lang="ts">
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Package from 'lucide-svelte/icons/package';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import { onMount } from 'svelte';
  import { materials, loadMaterials, getLowStockMaterials } from '$lib/inventory/store';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from 'svelte-i18n';
  import type { Category } from '$lib/inventory/types';

  let searchQuery = $state('');
  let categoryFilter: Category | 'ALL' = $state('ALL');
  let showLowStockOnly = $state(false);
  let materialList = $state<any[]>([]);
  let lowStockList = $state<any[]>([]);

  // Load materials and subscribe to store updates
  onMount(() => {
    let unsub: (() => void) | null = null;
    void loadMaterials().then(() => {
      unsub = materials.subscribe((value) => {
        materialList = value;
        lowStockList = getLowStockMaterials();
      });
      lowStockList = getLowStockMaterials();
    });
    return () => { if (unsub) unsub(); };
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
  <title>{$t('inventory.catalog', { default: 'Material Catalog' })} — Reclame OMS</title>
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
      <option value="ALL">{$t('inventory.all_categories', { default: 'All Categories' })}</option>
      <optgroup label={$t('inventoryCatalog.group_acrylics')}>
        <option value="ACRYLIC_XT">{$t('inventoryCatalog.materials.ACRYLIC_XT')}</option>
        <option value="ACRYLIC_GS">{$t('inventoryCatalog.materials.ACRYLIC_GS')}</option>
        <option value="ACRYLIC_LED">{$t('inventoryCatalog.materials.ACRYLIC_LED')}</option>
        <option value="ACRYLIC_SPECIAL">{$t('inventoryCatalog.materials.ACRYLIC_SPECIAL')}</option>
      </optgroup>
      <optgroup label={$t('inventoryCatalog.group_metals')}>
        <option value="ALU_SHEET">{$t('inventoryCatalog.materials.ALU_SHEET')}</option>
        <option value="ALU_COMPOSITE">{$t('inventoryCatalog.materials.ALU_COMPOSITE', { default: 'Alu Composite (ACP)' })}</option>
        <option value="ALU_PROFILE">{$t('inventoryCatalog.materials.ALU_PROFILE')}</option>
        <option value="STEEL">{$t('inventoryCatalog.materials.STEEL')}</option>
      </optgroup>
      <optgroup label={$t('inventoryCatalog.group_films_vinyl')}>
        <option value="VINYL_ORACAL">{$t('inventoryCatalog.materials.VINYL_ORACAL')}</option>
        <option value="VINYL_SPECIAL">{$t('inventoryCatalog.materials.VINYL_SPECIAL')}</option>
      </optgroup>
      <optgroup label={$t('inventoryCatalog.group_paints')}>
        <option value="PAINT_RAL">{$t('inventoryCatalog.materials.PAINT_RAL')}</option>
        <option value="PAINT_PANTONE">{$t('inventoryCatalog.materials.PAINT_PANTONE')}</option>
      </optgroup>
      <optgroup label={$t('inventoryCatalog.group_electronics')}>
        <option value="LED_MODULE">{$t('inventoryCatalog.materials.LED_MODULE')}</option>
        <option value="LED_STRIP">{$t('inventoryCatalog.materials.LED_STRIP')}</option>
        <option value="PSU_MEANWELL">{$t('inventoryCatalog.materials.PSU_MEANWELL')}</option>
        <option value="WIRE">{$t('inventoryCatalog.materials.WIRE')}</option>
      </optgroup>
      <optgroup label={$t('inventoryCatalog.group_other', { default: 'Other' })}>
        <option value="PVC_FOAM">{$t('inventoryCatalog.materials.PVC_FOAM', { default: 'PVC Foam (Forex)' })}</option>
        <option value="HARDWARE">{$t('inventoryCatalog.materials.HARDWARE', { default: 'Hardware' })}</option>
        <option value="CONSUMABLE">{$t('inventoryCatalog.materials.CONSUMABLE', { default: 'Consumables' })}</option>
        <option value="3D_PRINTING">{$t('inventoryCatalog.materials.3D_PRINTING', { default: '3D Printing' })}</option>
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
        <p>{$t('inventory.no_materials', { default: 'No materials found' })}</p>
        {#if searchQuery || categoryFilter !== 'ALL'}
          <button class="btn ghost" onclick={() => { searchQuery = ''; categoryFilter = 'ALL'; }}>
            {$t('inventory.clear_filters', { default: 'Clear Filters' })}
          </button>
        {/if}
      </div>
    {/each}
  </div>
</section>

<style>
  .page-container {
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-xl);
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xl);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .header-title h1 {
    margin: 0;
    font-size: var(--text-3xl);
    font-weight: 700;
  }
  
  .alert-banner {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--warn-soft);
    border: 1px solid color-mix(in oklab, var(--warn) 35%, transparent);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-lg);
    color: var(--warn);
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
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    cursor: pointer;
  }
  
  .material-card:hover {
    border-color: var(--accent, var(--brand));
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 10%, transparent);
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
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  
  .btn.primary {
    background: var(--accent, var(--brand));
    color: white;
    border: none;
  }
  
  .btn.primary:hover {
    background: var(--accent-hover, var(--brand));
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
