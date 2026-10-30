<script lang="ts">
  import { preventDefault } from 'svelte/legacy';
  import { untrack, onDestroy } from 'svelte';

  import { t } from 'svelte-i18n';
  import { createMaterial, updateMaterial, type Material } from './store';
  import type { Section } from './types';
  import { getAssistantContext } from '$lib/assistant/context';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { inventoryItemEditorFields, inventoryItemEditorFingerprint, screenOwnerKey, type InventoryEditorSnapshot } from '$lib/assistant/operational-context';
  const assistantState = getAssistantContext().state;

  const controlId = $props.id();

  // Accept both 'material' and 'item' props for backwards compatibility
  let { material, item = $bindable(), onClose = () => {}, onDraftChange }: {
    material?: Partial<Material>; item?: Partial<Material>; onClose?: () => void;
    onDraftChange?: (draft: InventoryEditorSnapshot | null) => void;
  } = $props();
  
  // Each modal opening mounts a new draft. Keep later store refreshes from
  // replacing unsaved metadata edits; use material before the legacy item prop.
  let data = $state<Partial<Material>>(untrack(() => ({
    section: 'materials',
    ...(material || item || {})
  })));

  const sectionOptions: { id: Section; labelKey: string }[] = [
    { id: 'materials', labelKey: 'inventory.materials' },
    { id: 'leftovers', labelKey: 'inventory.leftovers' },
    { id: 'paints', labelKey: 'inventory.paints' },
    { id: 'tools', labelKey: 'inventory.tools' },
    { id: 'cons', labelKey: 'inventory.consumables' }
  ];

  const isNew = $derived(!data.id);

  $effect(() => {
    if (!data.section) {
      data.section = 'materials';
    }
  });

  let saving=$state(false);
  let saveError=$state('');
  let disposed = false;
  const initialFingerprint = untrack(() => inventoryItemEditorFingerprint(data));
  $effect(() => {
    const snapshot: InventoryEditorSnapshot = { mode: isNew ? 'create' : 'edit', id: data.id ?? null,
      fields: inventoryItemEditorFields(data), unsavedChanges: inventoryItemEditorFingerprint(data) !== initialFingerprint,
      saving, error: !!saveError };
    untrack(() => onDraftChange?.(snapshot));
  });
  onDestroy(() => { disposed = true; onDraftChange?.(null); });
  async function save() {
    if(saving)return;
    saving=true;saveError='';
    const payload = { ...data } as Partial<Material> & { id?: string };
    const owner = screenOwnerKey($currentUser), record = data.id;
    const accept = () => !disposed && screenOwnerKey($currentUser) === owner && data.id === record;
    const section = (payload.section as Section) ?? 'materials';
    payload.section = section;

    try{
      const {id: _id,stock:_stock,...metadata}=payload;
      const result=isNew?await createMaterial({...metadata,stock:0},{ accept }):
        data.id?await updateMaterial(data.id,metadata,{ accept }):null;
      if (!accept()) return;
      if(!result)throw Error($t('inventoryConsolidation.metadataFailed'));
      onClose();
    }catch(e){
      if (accept()) saveError=e instanceof Error?e.message:$t('inventoryConsolidation.metadataFailed');
    }finally{if (accept()) saving=false;}
  }
</script>

<div class="sheet" role="dialog" aria-modal={!$assistantState.isOpen} aria-label={isNew ? $t('inventory.newItem') : $t('inventory.editItem')}>
  <form class="card" onsubmit={preventDefault(save)}>
    <header class="row" style="justify-content:space-between">
      <strong>{isNew ? $t('inventory.newItem') : $t('inventory.editItem')}</strong>
      <div class="row">
        <button class="tag ghost" type="button" onclick={onClose}>{$t('actions.cancel')}</button>
        <button class="tag" type="submit" disabled={saving}>{$t('inventory.save')}</button>
      </div>
    </header>

    <div class="grid" style="--cols:2">
      <label>
        {$t('inventory.section')}
        <select bind:value={data.section}>
          {#each sectionOptions as option}
            <option value={option.id}>{$t(option.labelKey)}</option>
          {/each}
        </select>
      </label>
      <label>
        {$t('inventory.group')}
        <input bind:value={data.item_group} placeholder={$t('inventory.modal.group_placeholder')} />
      </label>
      <label>
        {$t('inventory.modal.subgroup_label')}
        <input bind:value={data.subgroup} placeholder={$t('inventory.modal.subgroup_placeholder')} />
      </label>
      <label>
        {$t('inventory.modal.sku_label')}
        <input bind:value={data.sku} />
      </label>
      <label>
        {$t('inventory.headers.name')}
        <input bind:value={data.name_en} />
      </label>
      <label>
        {$t('inventory.headers.unit')}
        <input bind:value={data.unit} placeholder={$t('inventory.modal.unit_placeholder')} />
      </label>
      <div class="stock-read-only">
        <strong>{$t('inventory.headers.stock')}</strong>
        <span>{isNew?0:data.stock??0}</span>
        <p>{$t(isNew?'inventoryConsolidation.newMaterialZero':
          'inventoryConsolidation.auditedStockOnly')}</p>
      </div>
      <label>
        {$t('inventory.headers.minimum')}
        <input type="number" min="0" bind:value={data.min_stock} />
      </label>
      <label>
        {$t('inventory.headers.location')}
        <input bind:value={data.location} placeholder={$t('inventory.modal.location_placeholder')} />
      </label>
      <label>
        {$t('inventory.labels.color', { default: 'Color Code' })}
        <input bind:value={data.color_code} placeholder="e.g., RAL 9010" />
      </label>
      <div class="color-field">
        <label for={`${controlId}-hex`}>{$t('inventory.hexColor', { default: 'Color (Hex)' })}</label>
        <div class="color-input-row">
          <input type="color" bind:value={data.hex_color} class="color-picker"
            aria-label={$t('inventory.hexColor', { default: 'Color (Hex)' })} />
          <input id={`${controlId}-hex`} bind:value={data.hex_color} placeholder="#000000" class="color-text" />
        </div>
      </div>
      <label>
        {$t('inventory.modal.supplier_label')}
        <input bind:value={data.supplier} />
      </label>
      <label>
        {$t('inventory.modal.price_label')}
        <input type="number" step="0.01" bind:value={data.price} />
      </label>
      <label>
        {$t('inventory.modal.barcode_label')}
        <input bind:value={data.barcode} placeholder={$t('inventory.modal.barcode_placeholder')} />
      </label>
    </div>
    {#if saveError}<p role="alert" class="warning">{saveError}</p>{/if}
  </form>
</div>

<style>
.sheet {
  position: fixed;
  inset: 0;
  background: color-mix(in oklab, var(--bg-0) 55%, transparent);
  display: grid;
  place-items: center;
  z-index: 60;
  padding: 16px;
  backdrop-filter: blur(2px);
}
.card {
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}
label, .color-field {
  display: grid;
  gap: 6px;
  margin: 8px 0;
}
.color-field label { margin: 0; }
input, select {
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px;
  color: var(--text);
}
.color-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.color-picker {
  width: 44px;
  height: 36px;
  padding: 2px;
  cursor: pointer;
}
.color-text {
  flex: 1;
}
</style>
