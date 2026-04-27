<script lang="ts">
  import { materials, move, updateMaterial, removeMaterial, type Material } from '$lib/inventory/store';
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { t } from 'svelte-i18n';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import Save from 'lucide-svelte/icons/save';
  import Trash from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import Minus from 'lucide-svelte/icons/minus';
  import Package from 'lucide-svelte/icons/package';
  import MapPin from 'lucide-svelte/icons/map-pin';
  import Tag from 'lucide-svelte/icons/tag';
  import Clock from 'lucide-svelte/icons/clock';

  // Get id from URL params via page store
  let materialId = $derived(page.params.id);

  let material: Material | undefined = $state(undefined);
  let editMode = $state(false);
  let editedMaterial: Partial<Material> = $state({});

  const unsubscribe = materials.subscribe((list) => {
    material = list.find((x) => x.id === materialId);
    if (material) {
      editedMaterial = { ...material };
    }
  });

  onDestroy(() => unsubscribe?.());

  $effect(() => {
    if (!material && browser && materialId) {
      // Material not found after store loaded
      setTimeout(() => {
        if (!material) goto(`${base}/inventory`);
      }, 500);
    }
  });

  let adjustAmount = $state(1);
  let adjustNote = $state('');

  function adjust(kind: 'IN' | 'OUT') {
    if (!material || adjustAmount <= 0) return;
    move(material.id, kind, adjustAmount, 'user', adjustNote || undefined);
    adjustAmount = 1;
    adjustNote = '';
  }

  async function saveChanges() {
    if (!material || !editedMaterial) return;
    await updateMaterial(material.id, editedMaterial);
    editMode = false;
  }

  async function deleteMaterial() {
    if (!material) return;
    if (confirm(`Delete "${material.name_en || material.code}"? This cannot be undone.`)) {
      await removeMaterial(material.id);
      goto(`${base}/inventory`);
    }
  }
</script>

<div class="material-page">
  <header class="page-header">
    <a href="{base}/inventory" class="back-link">
      <ArrowLeft size={20} />
      <span>{$t('inventory.actions.back', { default: 'Back to Inventory' })}</span>
    </a>
    {#if material}
      <div class="header-actions">
        {#if editMode}
          <button class="btn-secondary" onclick={() => editMode = false}>{$t('actions.cancel', { default: 'Cancel' })}</button>
          <button class="btn-primary" onclick={saveChanges}>
            <Save size={16} />
            Save Changes
          </button>
        {:else}
          <button class="btn-secondary" onclick={() => editMode = true}>{$t('inventory.editItem', { default: 'Edit' })}</button>
          <button class="btn-danger" onclick={deleteMaterial}>
            <Trash size={16} />
            Delete
          </button>
        {/if}
      </div>
    {/if}
  </header>

  {#if material}
    <div class="material-container">
      <!-- Main Info Card -->
      <div class="info-card main-info">
        <div class="info-header">
          {#if material.hex_color}
            <div class="color-preview" style="background-color: {material.hex_color}"></div>
          {:else}
            <div class="icon-preview">
              <Package size={32} />
            </div>
          {/if}
          <div class="info-title">
            {#if editMode}
              <input class="edit-input title-input" bind:value={editedMaterial.name_en} placeholder="Material name" />
              <input class="edit-input sku-input" bind:value={editedMaterial.sku} placeholder="SKU" />
            {:else}
              <h1>{material.name_en}</h1>
              <span class="sku">{material.sku}</span>
            {/if}
          </div>
        </div>

        <div class="info-grid">
          <div class="info-material">
            <Tag size={16} />
            <span class="info-label">{$t('inventory.item_group', { default: 'Category' })}</span>
            {#if editMode}
              <input class="edit-input" bind:value={editedMaterial.item_group} />
            {:else}
              <span class="info-value">{material.item_group || material.category}</span>
            {/if}
          </div>
          
          <div class="info-material">
            <MapPin size={16} />
            <span class="info-label">{$t('inventory.headers.location', { default: 'Location' })}</span>
            {#if editMode}
              <input class="edit-input" bind:value={editedMaterial.location} />
            {:else}
              <span class="info-value">{material.location || '—'}</span>
            {/if}
          </div>

          <div class="info-material">
            <Clock size={16} />
            <span class="info-label">{$t('inventory.labels.updated', { default: 'Last Updated' })}</span>
            <span class="info-value">{new Date(material.updated_at).toLocaleString()}</span>
          </div>
        </div>

        {#if material.color_code}
          <div class="color-info">
            <span class="color-code">{material.color_code}</span>
            {#if material.hex_color}
              <span class="hex-value">{material.hex_color}</span>
            {/if}
          </div>
        {/if}

        {#if material.note}
          <div class="material-note">
            <strong>Notes:</strong>
            <p>{material.note}</p>
          </div>
        {/if}
      </div>

      <!-- Stock Card -->
      <div class="info-card stock-card">
        <h2>{$t('inventory.labels.stock', { default: 'Stock' })}</h2>
        
        <div class="stock-display">
          <div class="stock-current" class:low={material.stock <= material.min_stock}>
            <span class="stock-number">{material.stock}</span>
            <span class="stock-unit">{material.unit}</span>
          </div>
          <div class="stock-min_stock">
            Min: {material.min_stock} {material.unit}
          </div>
        </div>

        <div class="stock-actions">
          <div class="adjust-controls">
            <div class="adjust-amount">
              <button class="amount-btn" onclick={() => adjustAmount = Math.max(1, adjustAmount - 1)}>
                <Minus size={16} />
              </button>
              <input type="number" min="1" bind:value={adjustAmount} class="amount-input" />
              <button class="amount-btn" onclick={() => adjustAmount += 1}>
                <Plus size={16} />
              </button>
            </div>
            <input 
              type="text" 
              placeholder="Note (optional)" 
              bind:value={adjustNote}
              class="note-input"
            />
          </div>
          <div class="adjust-buttons">
            <button class="btn-success" onclick={() => adjust('IN')}>
              <Plus size={16} />
              Add Stock
            </button>
            <button class="btn-warning" onclick={() => adjust('OUT')}>
              <Minus size={16} />
              Remove Stock
            </button>
          </div>
        </div>
      </div>

      <!-- Details Card -->
      {#if material.supplier || material.price || material.barcode || material.thickness_mm}
        <div class="info-card details-card">
          <h2>{$t('inventory.supplierInfo', { default: 'Details' })}</h2>
          <div class="details-grid">
            {#if material.supplier}
              <div class="detail-material">
                <span class="detail-label">Supplier</span>
                <span class="detail-value">{material.supplier}</span>
              </div>
            {/if}
            {#if material.price}
              <div class="detail-material">
                <span class="detail-label">Price</span>
                <span class="detail-value">€{material.price.toFixed(2)}</span>
              </div>
            {/if}
            {#if material.barcode}
              <div class="detail-material">
                <span class="detail-label">Barcode</span>
                <span class="detail-value mono">{material.barcode}</span>
              </div>
            {/if}
            {#if material.thickness_mm}
              <div class="detail-material">
                <span class="detail-label">Thickness</span>
                <span class="detail-value">{material.thickness_mm} mm</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading material...</p>
    </div>
  {/if}
</div>

<style>
.material-page {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-lg);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
  gap: var(--space-md);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--text);
  text-decoration: none;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  transition: background 0.2s;
}

.back-link:hover {
  background: var(--bg-2);
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

.material-container {
  display: grid;
  gap: var(--space-lg);
}

.info-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
}

.info-card h2 {
  margin: 0 0 var(--space-lg) 0;
  font-size: var(--step-1);
  font-weight: 600;
  color: var(--text);
}

.info-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--border);
}

.color-preview {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border);
  flex-shrink: 0;
}

.icon-preview {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  flex-shrink: 0;
}

.info-title {
  flex: 1;
}

.info-title h1 {
  margin: 0 0 var(--space-xs) 0;
  font-size: var(--step-2);
}

.info-title .sku {
  color: var(--muted);
  font-family: monospace;
  font-size: 0.875rem;
}

.edit-input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: 1rem;
}

.title-input {
  font-size: var(--step-2);
  font-weight: 600;
  margin-bottom: var(--space-sm);
}

.sku-input {
  font-family: monospace;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-lg);
}

.info-material {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.info-material > :global(svg) {
  color: var(--muted);
}

.info-label {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-weight: 500;
  color: var(--text);
}

.color-info {
  display: flex;
  gap: var(--space-md);
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: var(--bg-0);
  border-radius: var(--radius-md);
}

.color-code {
  font-weight: 600;
}

.hex-value {
  color: var(--muted);
  font-family: monospace;
}

.material-note {
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: var(--bg-0);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--accent-1, var(--brand));
}

.material-note p {
  margin: var(--space-xs) 0 0 0;
  color: var(--muted);
}

/* Stock Card */
.stock-display {
  display: flex;
  align-items: baseline;
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.stock-current {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.stock-current.low .stock-number {
  color: var(--danger);
}

.stock-number {
  font-size: 3rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}

.stock-unit {
  font-size: 1.25rem;
  color: var(--muted);
}

.stock-min_stock {
  color: var(--muted);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-0);
  border-radius: var(--radius-full);
  font-size: 0.875rem;
}

.stock-actions {
  border-top: 1px solid var(--border);
  padding-top: var(--space-lg);
}

.adjust-controls {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
  flex-wrap: wrap;
}

.adjust-amount {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.amount-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
  transition: background 0.2s;
}

.amount-btn:hover {
  background: var(--bg-2);
}

.amount-input {
  width: 60px;
  height: 40px;
  text-align: center;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 1rem;
  font-weight: 600;
}

.amount-input::-webkit-inner-spin-button,
.amount-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.note-input {
  flex: 1;
  min_stock-width: 150px;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
}

.adjust-buttons {
  display: flex;
  gap: var(--space-md);
}

/* Details Card */
.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-lg);
}

.detail-material {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.detail-label {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
}

.detail-value {
  font-weight: 500;
}

.detail-value.mono {
  font-family: monospace;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-success,
.btn-warning,
.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: var(--accent-1, var(--brand));
  color: var(--bg-0);
}

.btn-secondary {
  background: var(--bg-0);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-success {
  background: var(--ok);
  color: var(--bg-0);
}

.btn-warning {
  background: var(--warn);
  color: var(--ink-primary);
}

.btn-danger {
  background: var(--danger);
  color: var(--bg-0);
}

.btn-primary:hover,
.btn-success:hover,
.btn-warning:hover,
.btn-danger:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-secondary:hover {
  background: var(--bg-2);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  color: var(--muted);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent-1, var(--brand));
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: var(--space-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .material-page {
    padding: var(--space-md);
  }

  .info-card {
    padding: var(--space-lg);
  }

  .info-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .stock-display {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .adjust-buttons {
    flex-direction: column;
  }

  .adjust-buttons button {
    width: 100%;
    justify-content: center;
  }
}
</style>
