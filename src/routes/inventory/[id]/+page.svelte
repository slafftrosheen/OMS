<script lang="ts">
  import { materials, move, updateMaterial, removeMaterial, loadMaterialById, type Material } from '$lib/inventory/store';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { onMount,onDestroy } from 'svelte';
  import { base } from '$app/paths';
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
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import { emptyConfirm, type ConfirmState } from '$lib/components/ui/confirm-types';

  // Get id from URL params via page store
  let materialId = $derived(page.params.id);

  let material: Material | undefined = $state(undefined);
  let editMode = $state(false);
  let editedMaterial: Partial<Material> = $state({});

  const unsubscribe = materials.subscribe((list) => {
    material = list.find((x) => x.id === materialId);
    if (material && !editMode) {
      editedMaterial = { ...material };
    }
  });

  onDestroy(() => unsubscribe?.());

  let detailLoading=$state(true);
  let detailUnavailable=$state(false);
  onMount(()=>{
    let active=true;
    void loadMaterialById(materialId).then(item=>{
      if(!active)return;
      detailLoading=false;
      detailUnavailable=!item;
    });
    return()=>{active=false;};
  });

  let adjustAmount = $state(1);
  let adjustNote = $state('');
  let adjusting=$state(false);
  let savingMetadata=$state(false);
  let inventoryMessage=$state('');
  let inventoryFailure=$state('');
  let canManage=$derived(['RD','Boss','HeadOfProduction'].includes($currentUser?.role??''));

  async function adjust(kind: 'IN' | 'OUT') {
    if(!material||adjusting||!canManage||detailLoading||detailUnavailable)return;
    if(!Number.isSafeInteger(adjustAmount)||adjustAmount<=0){
      inventoryFailure=$t('inventoryConsolidation.invalidQuantity');return;
    }
    adjusting=true;inventoryFailure='';inventoryMessage='';
    try{
      const receipt=await move(material.id,kind,adjustAmount,'',adjustNote||undefined);
      if(!receipt)throw Error($t('inventoryConsolidation.movementUnconfirmed'));
      inventoryMessage=$t('inventoryConsolidation.movementSaved');
      adjustAmount=1;adjustNote='';
    }catch(e){
      inventoryFailure=e instanceof Error?e.message:$t('inventoryConsolidation.movementUnconfirmed');
    }finally{adjusting=false;}
  }

  async function saveChanges() {
    if(!material||savingMetadata||!canManage||detailLoading||detailUnavailable)return;
    savingMetadata=true;inventoryFailure='';inventoryMessage='';
    try{
      const {stock:_stock,...metadata}=editedMaterial;
      const updated=await updateMaterial(material.id,metadata);
      if(!updated)throw Error($t('inventoryConsolidation.metadataFailed'));
      editMode=false;
      inventoryMessage=$t('inventoryConsolidation.metadataSaved');
    }catch(e){
      inventoryFailure=e instanceof Error?e.message:$t('inventoryConsolidation.metadataFailed');
    }finally{savingMetadata=false;}
  }

  let confirmState = $state<ConfirmState>(emptyConfirm());

  function deleteMaterial() {
    if (!material) return;
    const m = material;
    confirmState = {
      open: true,
      title: $t('inventoryDetail.delete_title', { default: 'Delete material' }),
      body: $t('inventoryDetail.delete_confirm', {
        default: 'Permanently delete "{name}"? This cannot be undone.',
        values: { name: m.name_en || m.code }
      }),
      tone: 'danger',
      action: async () => {
        await removeMaterial(m.id);
        goto(`${base}/inventory`);
      }
    };
  }
</script>

<div class="material-page">
  <header class="page-header">
    <a href="{base}/inventory" class="back-link">
      <ArrowLeft size={20} />
      <span>{$t('inventory.actions.back', { default: 'Back to Inventory' })}</span>
    </a>
    {#if material && !detailLoading && !detailUnavailable}
      <div class="header-actions">
        {#if editMode}
          <button class="btn-secondary" onclick={() => editMode = false}>{$t('actions.cancel', { default: 'Cancel' })}</button>
          <button class="btn-primary" disabled={savingMetadata||!canManage} onclick={saveChanges}>
            <Save size={16} />
            {$t('common.save')}
          </button>
        {:else}
          <button class="btn-secondary" disabled={!canManage} onclick={() => editMode = true}>{$t('inventory.editItem', { default: 'Edit' })}</button>
          <button class="btn-danger" disabled={!canManage} onclick={deleteMaterial}>
            <Trash size={16} />
            {$t('common.delete')}
          </button>
        {/if}
      </div>
    {/if}
  </header>

  {#if detailLoading}
    <p role="status">{$t('inventoryConsolidation.detailLoading')}</p>
  {:else if detailUnavailable}
    <p role="alert">{$t('inventoryConsolidation.detailUnavailable')}</p>
  {:else if material}
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
              <input class="edit-input title-input" bind:value={editedMaterial.name_en} placeholder={$t('inventoryDetail.material_name')} />
              <input class="edit-input sku-input" bind:value={editedMaterial.sku} placeholder={$t('common.sku')} />
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
            <strong>{$t('inventoryDetail.notes')}:</strong>
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
            {$t('inventory.labels.min')}: {material.min_stock} {material.unit}
          </div>
        </div>

        <p class="stock-guidance">{$t('inventoryConsolidation.auditedStockOnly')}</p>
        {#if inventoryFailure}<p role="alert" class="stock-guidance">{inventoryFailure}</p>{/if}
        {#if inventoryMessage}<p role="status" class="stock-guidance">{inventoryMessage}</p>{/if}
        {#if canManage}
        <div class="stock-actions">
          <div class="adjust-controls">
            <div class="adjust-amount">
              <button class="amount-btn" aria-label={$t('inventoryDetail.decreaseQuantity')} onclick={() => adjustAmount = Math.max(1, adjustAmount - 1)}>
                <Minus size={16} />
              </button>
              <input type="number" min="1" aria-label={$t('inventoryDetail.adjustQuantity')} bind:value={adjustAmount} class="amount-input" />
              <button class="amount-btn" aria-label={$t('inventoryDetail.increaseQuantity')} onclick={() => adjustAmount += 1}>
                <Plus size={16} />
              </button>
            </div>
            <input
              type="text"
              placeholder={$t('common.note_optional')}
              bind:value={adjustNote}
              class="note-input"
            />
          </div>
          <div class="adjust-buttons">
            <button class="btn-success" disabled={adjusting} onclick={() => adjust('IN')}>
              <Plus size={16} />
              {$t('inventoryDetail.addStock')}
            </button>
            <button class="btn-warning" disabled={adjusting} onclick={() => adjust('OUT')}>
              <Minus size={16} />
              {$t('inventoryDetail.removeStock')}
            </button>
          </div>
        </div>
        {/if}
      </div>

      <!-- Details Card -->
      {#if material.supplier || material.price || material.barcode || material.thickness_mm}
        <div class="info-card details-card">
          <h2>{$t('inventory.supplierInfo', { default: 'Details' })}</h2>
          <div class="details-grid">
            {#if material.supplier}
              <div class="detail-material">
                <span class="detail-label">{$t('inventoryDetail.supplier')}</span>
                <span class="detail-value">{material.supplier}</span>
              </div>
            {/if}
            {#if material.price}
              <div class="detail-material">
                <span class="detail-label">{$t('inventoryDetail.price')}</span>
                <span class="detail-value">€{material.price.toFixed(2)}</span>
              </div>
            {/if}
            {#if material.barcode}
              <div class="detail-material">
                <span class="detail-label">{$t('inventoryDetail.barcode')}</span>
                <span class="detail-value mono">{material.barcode}</span>
              </div>
            {/if}
            {#if material.thickness_mm}
              <div class="detail-material">
                <span class="detail-label">{$t('inventoryDetail.thickness')}</span>
                <span class="detail-value">{material.thickness_mm} mm</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="loading-state">
      <div class="rf-spinner"></div>
      <p>{$t('inventoryDetail.loading', { default: 'Loading material…' })}</p>
    </div>
  {/if}
</div>

<ConfirmModal bind:state={confirmState} />

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
  min-width: 150px;
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
  color: white;
}

.btn-secondary {
  background: var(--bg-0);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-success {
  background: var(--ok);
  color: white;
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

  /* Graphite material record; colour sample is user data, never brand-tinted. */
  .material-page {max-width:1180px;padding:var(--space-lg) 0 var(--space-2xl);}
  .page-header {position:relative;border-bottom:1px solid var(--divider);padding:var(--space-md) 0;
    gap:var(--space-md);}
  .page-header::before {content:'';position:absolute;top:0;left:0;height:2px;width:80px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  .back-link {min-height:44px;color:var(--ink-secondary);border-radius:var(--radius-sm);}
  .back-link:hover {color:var(--ink-primary);}
  .header-actions {flex-wrap:wrap;gap:var(--space-xs);}
  .header-actions button {min-height:42px;border-radius:var(--radius-sm);}
  .material-container {grid-template-columns:minmax(0,1.55fr) minmax(270px,1fr);align-items:start;
    gap:var(--space-md);}
  .main-info {grid-column:1;}.stock-card {grid-column:2;}
  .details-card {grid-column:1/-1;}
  .info-card {min-width:0;background:var(--glass-bg-strong);border:1px solid var(--glass-border);
    border-radius:var(--radius-lg);padding:var(--space-xl);box-shadow:var(--glass-shadow-sm);}
  .info-card h2 {font-size:var(--text-lg);color:var(--ink-primary);}
  .info-title {min-width:0;}
  .info-title h1 {font-size:clamp(1.4rem,2.3vw,1.9rem);letter-spacing:var(--tracking-tight);
    overflow-wrap:anywhere;}
  .color-preview {width:70px;height:70px;border:2px solid var(--border-strong);}
  .info-label {color:var(--ink-tertiary);letter-spacing:.04em;}
  .info-value {overflow-wrap:anywhere;}
  .stock-number {font-size:clamp(2.2rem,4vw,3rem);font-variant-numeric:tabular-nums;}
  .stock-current.low .stock-number {color:var(--error);}
  .stock-min_stock {background:var(--bg-2);border:1px solid var(--border);
    border-radius:var(--radius-sm);}
  .stock-actions {border-color:var(--divider);}
  .adjust-amount {background:var(--bg-1);border-color:var(--border);}
  .amount-btn {min-width:44px;min-height:44px;}
  .amount-input {min-height:44px;font-variant-numeric:tabular-nums;}
  .note-input {min-width:0;background:var(--bg-1);}
  .adjust-buttons {gap:var(--space-sm);}
  .adjust-buttons button {min-height:44px;border-radius:var(--radius-sm);}
  .edit-input {min-height:44px;background:var(--bg-1);color:var(--ink-primary);}
  .edit-input:focus-visible,.amount-input:focus-visible,.note-input:focus-visible,
  .amount-btn:focus-visible,.header-actions button:focus-visible {
    outline:2px solid var(--focus);outline-offset:2px;}
  .material-note {background:var(--bg-2);border-color:var(--brand);}
  .color-info {background:var(--bg-2);flex-wrap:wrap;overflow-wrap:anywhere;}
  .btn-primary {background:var(--brand);color:var(--on-brand);}
  .btn-primary:hover {background:var(--brand-2);}
  @media(max-width:950px){.material-container {grid-template-columns:minmax(0,1fr);}
    .main-info,.stock-card,.details-card {grid-column:auto;}}
  @media(max-width:650px){.material-page {padding:var(--space-sm) 0 var(--space-xl);}
    .info-card {padding:var(--space-lg);}.header-actions {width:100%;}
    .header-actions button {flex:1 1 auto;}.info-header {gap:var(--space-sm);}
    .adjust-controls {flex-direction:column;}}
  @media(prefers-reduced-transparency:reduce){.info-card {background:var(--bg-1);}}
</style>
