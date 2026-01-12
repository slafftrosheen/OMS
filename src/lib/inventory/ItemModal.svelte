<script lang="ts">
  import { t } from 'svelte-i18n';
  import { createItem, updateItem, type Item } from './store';
  import type { Section } from './types';

  export let item: Partial<Item> = {};
  export let onClose = () => {};

  const sectionOptions: { id: Section; labelKey: string }[] = [
    { id: 'materials', labelKey: 'inventory.materials' },
    { id: 'leftovers', labelKey: 'inventory.leftovers' },
    { id: 'paints', labelKey: 'inventory.paints' },
    { id: 'tools', labelKey: 'inventory.tools' },
    { id: 'cons', labelKey: 'inventory.consumables' }
  ];

  const isNew = !item.id;

  $: if (!item.section) {
    item.section = 'materials';
  }

  function save() {
    const payload = { ...item } as Partial<Item> & { id?: string };
    const section = (payload.section as Section) ?? 'materials';
    payload.section = section;

    if (isNew) {
      const { id: _id, ...rest } = payload;
      createItem(rest);
    } else if (item.id) {
      const { id: _id, ...rest } = payload as Item;
      updateItem(item.id, rest);
    }
    onClose();
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label={isNew ? $t('inventory.newItem') : $t('inventory.editItem')}>
  <form class="card" on:submit|preventDefault={save}>
    <header class="row" style="justify-content:space-between">
      <strong>{isNew ? $t('inventory.newItem') : $t('inventory.editItem')}</strong>
      <div class="row">
        <button class="tag ghost" type="button" on:click={onClose}>{$t('actions.cancel')}</button>
        <button class="tag" type="submit">{$t('inventory.save')}</button>
      </div>
    </header>

    <div class="grid" style="--cols:2">
      <label>
        {$t('inventory.section')}
        <select bind:value={item.section}>
          {#each sectionOptions as option}
            <option value={option.id}>{$t(option.labelKey)}</option>
          {/each}
        </select>
      </label>
      <label>
        {$t('inventory.group')}
        <input bind:value={item.group} placeholder={$t('inventory.modal.group_placeholder')} />
      </label>
      <label>
        {$t('inventory.modal.subgroup_label')}
        <input bind:value={item.subgroup} placeholder={$t('inventory.modal.subgroup_placeholder')} />
      </label>
      <label>
        {$t('inventory.modal.sku_label')}
        <input bind:value={item.sku} />
      </label>
      <label>
        {$t('inventory.headers.name')}
        <input bind:value={item.name} />
      </label>
      <label>
        {$t('inventory.headers.unit')}
        <input bind:value={item.unit} placeholder={$t('inventory.modal.unit_placeholder')} />
      </label>
      <label>
        {$t('inventory.headers.stock')}
        <input type="number" min="0" bind:value={item.stock} />
      </label>
      <label>
        {$t('inventory.headers.minimum')}
        <input type="number" min="0" bind:value={item.min} />
      </label>
      <label>
        {$t('inventory.headers.location')}
        <input bind:value={item.location} placeholder={$t('inventory.modal.location_placeholder')} />
      </label>
      <label>
        {$t('inventory.labels.color', { default: 'Color Code' })}
        <input bind:value={item.colorCode} placeholder="e.g., RAL 9010" />
      </label>
      <label>
        {$t('inventory.hexColor', { default: 'Color (Hex)' })}
        <div class="color-input-row">
          <input type="color" bind:value={item.hexColor} class="color-picker" />
          <input bind:value={item.hexColor} placeholder="#000000" class="color-text" />
        </div>
      </label>
      <label>
        {$t('inventory.modal.supplier_label')}
        <input bind:value={item.supplier} />
      </label>
      <label>
        {$t('inventory.modal.price_label')}
        <input type="number" step="0.01" bind:value={item.price} />
      </label>
      <label>
        {$t('inventory.modal.barcode_label')}
        <input bind:value={item.barcode} placeholder={$t('inventory.modal.barcode_placeholder')} />
      </label>
    </div>
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
label {
  display: grid;
  gap: 6px;
  margin: 8px 0;
}
input, textarea, select {
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
