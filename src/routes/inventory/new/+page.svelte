<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { createMaterial, type Material } from '$lib/inventory/store';
  import type { Section } from '$lib/inventory/types';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import Save from 'lucide-svelte/icons/save';
  import Package from 'lucide-svelte/icons/package';
  import { notifications } from '$lib/notify/store';

  let material: Partial<Material> = $state({
    section: 'materials',
    item_group: '',
    subgroup: '',
    sku: '',
    name_en: '',
    unit: 'pcs',
    stock: 0,
    min_stock: 0,
    location: '',
    supplier: '',
    price: 0,
    barcode: '',
    color_code: '',
    hex_color: '#000000'
  });

  let saving = $state(false);

  const sectionOptions: { id: Section; label: string; icon: string }[] = [
    { id: 'materials', label: 'Materials', icon: '📦' },
    { id: 'leftovers', label: 'Leftovers', icon: '🔲' },
    { id: 'paints', label: 'Paints', icon: '🎨' },
    { id: 'tools', label: 'Tools', icon: '🔧' },
    { id: 'cons', label: 'Consumables', icon: '📎' },
    { id: 'electronics', label: 'Electronics', icon: '💡' },
    { id: '3dprinting', label: '3D Printing', icon: '🖨️' }
  ];

  const unitOptions = ['pcs', 'm', 'm²', 'kg', 'L', 'roll', 'sheet', 'box', 'set', 'ml', 'g'];

  async function save() {
    if (!material.sku || !material.name_en) {
      notifications.warning('SKU and Name are required');
      return;
    }

    saving = true;
    try {
      await createMaterial(material as Omit<Material, 'id'>);
      goto(`${base}/inventory`);
    } catch (err) {
      console.error('Failed to save material:', err);
      notifications.error('Failed to save material');
    } finally {
      saving = false;
    }
  }
</script>

<div class="new-material-page">
  <header class="page-header">
    <a href="{base}/inventory" class="back-link">
      <ArrowLeft size={20} />
      <span>{$t('inventory.actions.back', { default: 'Back to Inventory' })}</span>
    </a>
  </header>

  <div class="form-container">
    <div class="form-header">
      <Package size={24} />
      <div>
        <h1>{$t('inventory.new_page.title', { default: 'Add New Material' })}</h1>
        <p class="muted">{$t('inventory.new_page.description', { default: 'Fill in the details to add a new inventory material' })}</p>
      </div>
    </div>

    <form onsubmit={preventDefault(save)}>
      <!-- Section Selection -->
      <div class="form-section">
        <h2 class="section-title">{$t('inventory.section', { default: 'Section' })}</h2>
        <div class="section-grid">
          {#each sectionOptions as section}
            <button
              type="button"
              class="section-option"
              class:active={material.section === section.id}
              onclick={() => material.section = section.id}
            >
              <span class="section-icon">{section.icon}</span>
              <span class="section-label">{$t(`inventory.${section.id}`, { default: section.label })}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Basic Info -->
      <div class="form-section">
        <h2 class="section-title">{$t('inventory.basicInfo', { default: 'Basic Information' })}</h2>
        <div class="form-grid">
          <div class="form-field required">
            <label for="sku">{$t('inventory.headers.sku', { default: 'SKU' })}</label>
            <input id="sku" type="text" bind:value={material.sku} required placeholder="e.g., ORA-8500-010" />
          </div>
          <div class="form-field required">
            <label for="name">{$t('inventory.headers.name_en', { default: 'Name' })}</label>
            <input id="name" type="text" bind:value={material.name_en} required placeholder="e.g., Oracal 8500 White" />
          </div>
          <div class="form-field">
            <label for="group">{$t('inventory.item_group', { default: 'Group' })}</label>
            <input id="group" type="text" bind:value={material.item_group} placeholder="e.g., Vinyl Films" />
          </div>
          <div class="form-field">
            <label for="subgroup">{$t('inventory.modal.subgroup_label', { default: 'Subgroup' })}</label>
            <input id="subgroup" type="text" bind:value={material.subgroup} placeholder="e.g., Translucent" />
          </div>
        </div>
      </div>

      <!-- Stock Info -->
      <div class="form-section">
        <h2 class="section-title">{$t('inventory.stockInfo', { default: 'Stock Information' })}</h2>
        <div class="form-grid">
          <div class="form-field">
            <label for="unit">{$t('inventory.headers.unit', { default: 'Unit' })}</label>
            <select id="unit" bind:value={material.unit}>
              {#each unitOptions as unit}
                <option value={unit}>{unit}</option>
              {/each}
            </select>
          </div>
          <div class="form-field">
            <label for="stock">{$t('inventory.headers.stock', { default: 'Current Stock' })}</label>
            <input id="stock" type="number" min="0" step="0.01" bind:value={material.stock} />
          </div>
          <div class="form-field">
            <label for="min_stock">{$t('inventory.headers.minimum', { default: 'Minimum Stock' })}</label>
            <input id="min_stock" type="number" min="0" bind:value={material.min_stock} />
          </div>
          <div class="form-field">
            <label for="location">{$t('inventory.headers.location', { default: 'Location' })}</label>
            <input id="location" type="text" bind:value={material.location} placeholder="e.g., Shelf A-3" />
          </div>
        </div>
      </div>

      <!-- Color & Appearance (for materials/paints) -->
      {#if material.section === 'materials' || material.section === 'paints'}
        <div class="form-section">
          <h2 class="section-title">{$t('inventory.colorInfo', { default: 'Color & Appearance' })}</h2>
          <div class="form-grid">
            <div class="form-field">
              <label for="color_code">{$t('inventory.labels.color', { default: 'Color Code' })}</label>
              <input id="color_code" type="text" bind:value={material.color_code} placeholder="e.g., RAL 9010" />
            </div>
            <div class="form-field">
              <label for="hex_color">{$t('inventory.hex_color', { default: 'Color Preview' })}</label>
              <div class="color-input-wrapper">
                <input id="hex_color" type="color" bind:value={material.hex_color} />
                <input type="text" bind:value={material.hex_color} placeholder="#000000" class="color-text" />
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Supplier & Pricing -->
      <div class="form-section">
        <h2 class="section-title">{$t('inventory.supplierInfo', { default: 'Supplier & Pricing' })}</h2>
        <div class="form-grid">
          <div class="form-field">
            <label for="supplier">{$t('inventory.modal.supplier_label', { default: 'Supplier' })}</label>
            <input id="supplier" type="text" bind:value={material.supplier} placeholder="e.g., Lemona.lv" />
          </div>
          <div class="form-field">
            <label for="price">{$t('inventory.modal.price_label', { default: 'Price' })}</label>
            <input id="price" type="number" min="0" step="0.01" bind:value={material.price} placeholder="0.00" />
          </div>
          <div class="form-field">
            <label for="barcode">{$t('inventory.modal.barcode_label', { default: 'Barcode' })}</label>
            <input id="barcode" type="text" bind:value={material.barcode} placeholder="e.g., 4012345678901" />
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <a href="{base}/inventory" class="btn-secondary">
          {$t('actions.cancel', { default: 'Cancel' })}
        </a>
        <button type="submit" class="btn-primary" disabled={saving}>
          <Save size={18} />
          {saving ? $t('actions.saving', { default: 'Saving...' }) : $t('inventory.save', { default: 'Save Material' })}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
.new-material-page {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--space-lg);
}

.page-header {
  margin-bottom: var(--space-lg);
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

.form-container {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
}

.form-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--border);
}

.form-header h1 {
  margin: 0;
  font-size: var(--step-2);
}

.form-header .muted {
  margin: var(--space-xs) 0 0 0;
}

.form-section {
  margin-bottom: var(--space-xl);
}

.section-title {
  font-size: var(--step-1);
  font-weight: 600;
  margin: 0 0 var(--space-md) 0;
  color: var(--text);
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-sm);
}

.section-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--bg-0);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.section-option:hover {
  border-color: var(--accent-1, var(--brand));
}

.section-option.active {
  border-color: var(--accent-1, var(--brand));
  background: color-mix(in oklab, var(--accent-1, var(--brand)) 10%, var(--bg-1));
}

.section-icon {
  font-size: 1.5rem;
}

.section-label {
  font-weight: 500;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-md);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.form-field.required label::after {
  content: ' *';
  color: var(--danger);
}

.form-field label {
  font-weight: 500;
  color: var(--text);
  font-size: 0.875rem;
}

.form-field input,
.form-field select {
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-field input:focus,
.form-field select:focus {
  outline: none;
  border-color: var(--accent-1, var(--brand));
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent-1, var(--brand)) 20%, transparent);
}

.form-field input::placeholder {
  color: var(--muted);
  opacity: 0.6;
}

.color-input-wrapper {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.color-input-wrapper input[type="color"] {
  width: 50px;
  height: 44px;
  padding: 2px;
  cursor: pointer;
}

.color-input-wrapper .color-text {
  flex: 1;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--border);
}

.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.btn-primary {
  background: var(--accent-1, var(--brand));
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-0);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-2);
}

@media (max-width: 600px) {
  .new-material-page {
    padding: var(--space-md);
  }

  .form-container {
    padding: var(--space-lg);
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .section-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
    justify-content: center;
  }
}
</style>
