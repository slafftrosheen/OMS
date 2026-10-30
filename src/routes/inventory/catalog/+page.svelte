<script lang="ts">
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Package from 'lucide-svelte/icons/package';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import { onMount } from 'svelte';
  import { materials, catalogError, isLoading as inventoryLoading, loadMaterials, getLowStockMaterials } from '$lib/inventory/store';
  import {base} from '$app/paths';
  import {currentUser} from '$lib/auth/authState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from 'svelte-i18n';
  import type { Category } from '$lib/inventory/types';
  import { getAssistantContext } from '$lib/assistant/context';
  import { inventoryCatalogScreenContext } from '$lib/assistant/visible-context';

  const assistant = getAssistantContext();

  let searchQuery = $state('');
  let categoryFilter: Category | 'ALL' = $state('ALL');
  let showLowStockOnly = $state(false);
  let materialList = $state<any[]>([]);
  let lowStockList = $state<any[]>([]);
  let catalogFailure=$state<string|null>(null);
  let canManage=$derived(['RD','Boss','HeadOfProduction'].includes($currentUser?.role??''));

  // Load materials and subscribe to store updates
  onMount(() => {
    const unsub=materials.subscribe(value=>{
      materialList=value;
      lowStockList=getLowStockMaterials();
    });
    const unsubError=catalogError.subscribe(value=>catalogFailure=value);
    void loadMaterials();
    const unregister = assistant.register({
      id: 'materials:inventory-catalog', title: () => $t('inventory.catalog', { default: 'Material Catalog' }),
      tools: () => [],
      context: () => inventoryCatalogScreenContext({
        loading: $inventoryLoading, error: !!catalogFailure, search: searchQuery,
        category: categoryFilter, lowStockOnly: showLowStockOnly,
        lowStockCount: lowStockList.length, canManage, rows: filteredMaterials
      })
    });
    return()=>{unsub();unsubError();unregister();};
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
    {#if canManage}
      <a class="btn primary" href={`${base}/inventory/new`}>
        <Plus size={16} />
        {$t('inventory.add_material') || 'Add Material'}
      </a>
    {/if}
  </div>
  
  {#if catalogFailure}
    <div class="alert-banner" role="alert">
      <AlertCircle size={20} />
      <span>{$t('inventoryConsolidation.catalogUnavailable')}</span>
      <button class="btn sm" onclick={()=>void loadMaterials()}>
        {$t('common.refresh',{default:'Refresh'})}
      </button>
    </div>
  {/if}
  {#if !catalogFailure && lowStockList.length > 0}
    <div class="alert-banner">
      <AlertCircle size={20} />
      <span>{lowStockList.length} {$t('inventory.low_stock_items') || 'materials low in stock'}</span>
      <button class="btn sm" aria-pressed={showLowStockOnly} onclick={() => showLowStockOnly = !showLowStockOnly}>
        {showLowStockOnly ? ($t('inventory.show_all') || 'Show All') : ($t('inventory.show_alerts') || 'Show Alerts Only')}
      </button>
    </div>
  {/if}
  
  <div class="filters-bar">
    <div class="search-box">
      <Search size={16} />
      <input type="search"
        bind:value={searchQuery}
        aria-label={$t('inventory.search_materials')}
        placeholder={$t('inventory.search_materials') || 'Search materials...'}
      />
    </div>
    
    <select bind:value={categoryFilter} aria-label={$t('inventory.all_categories')}>
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
      <a class="material-card" href={`${base}/inventory/${encodeURIComponent(material.id)}`}>
        <div class="material-image-placeholder">
          {#if material.hex_color}
            <span class="material-swatch" style:background-color={material.hex_color} aria-hidden="true"></span>
          {:else}
            <Package size={32} />
          {/if}
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
      </a>
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

  /* Material catalog entries are real links; swatches remain source data. */
  .page-container {max-width:1500px;padding:var(--space-lg) 0 var(--space-2xl);}
  .page-header {position:relative;gap:var(--space-md);flex-wrap:wrap;
    padding:var(--space-lg) 0;border-bottom:1px solid var(--divider);}
  .page-header::before {content:'';position:absolute;top:0;left:0;height:2px;width:90px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  .header-title h1 {font-size:clamp(1.5rem,2.7vw,2rem);letter-spacing:var(--tracking-tight);}
  .header-title :global(svg) {color:var(--brand);}
  .btn.primary {background:var(--brand);color:var(--on-brand);border-color:var(--brand);}
  .btn.primary:hover {background:var(--brand-2);}
  .btn {min-height:42px;border-radius:var(--radius-sm);}
  .alert-banner {border-radius:var(--radius-md);flex-wrap:wrap;}
  .filters-bar {gap:var(--space-sm);flex-wrap:wrap;}
  .search-box {min-height:44px;min-width:min(100%,260px);background:var(--bg-1);
    border-radius:var(--radius-sm);}
  .filters-bar select {min-height:44px;background:var(--bg-1);border-radius:var(--radius-sm);}
  .materials-grid {grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));
    gap:var(--space-md);}
  .material-card {display:flex;flex-direction:column;min-width:0;height:100%;
    color:var(--ink-primary);text-decoration:none;background:var(--glass-bg-strong);
    border:1px solid var(--glass-border);border-radius:var(--radius-lg);
    box-shadow:var(--glass-shadow-sm);transition:border-color var(--motion-sm) var(--ease-standard);}
  .material-card:hover {transform:none;border-color:color-mix(in oklab,var(--brand) 50%,var(--border));}
  .material-card:focus-visible,.search-box:focus-within,.filters-bar select:focus-visible,
  .btn:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
  .material-image-placeholder {height:84px;background:var(--bg-2);}
  .material-swatch {display:block;width:100%;height:100%;}
  .material-info {padding:var(--space-lg);min-width:0;}
  .material-info h3 {color:var(--ink-primary);}
  .material-brand {font-variant-numeric:tabular-nums;color:var(--ink-secondary);}
  .material-specs {gap:var(--space-xs);flex-wrap:wrap;}
  .spec-tag {border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-2);}
  .stock-info {border-top:1px solid var(--divider);padding-top:var(--space-sm);}
  .stock-value {font-variant-numeric:tabular-nums;}
  .low-stock-badge {background:var(--error-soft);color:var(--error);border-color:var(--error);}
  @media(max-width:720px) {.page-container {padding:var(--space-sm) 0 var(--space-xl);}
    .filters-bar{flex-direction:column;align-items:stretch;}
    .search-box,.filters-bar select{width:100%;}}
  @media(prefers-reduced-transparency:reduce) {.material-card{background:var(--bg-1);}}
</style>
