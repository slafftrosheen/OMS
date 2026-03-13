<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { t } from '$lib/i18n';
  import type { Order } from '$lib/stores/orders';

  let { 
    order = {}, 
    mode = 'create',
    onsubmit,
    oncancel
  }: {
    order?: Partial<Order>;
    mode?: 'create' | 'edit';
    onsubmit?: (data: any) => void;
    oncancel?: () => void;
  } = $props();

  let formData = $state({
    po_number: order.po_number || '',
    title: order.title || '',
    client: order.client || '',
    due_date: order.due_date || '',
    loading_date: order.loading_date || '',
    is_rd: order.is_rd || false,
    rd_notes: order.rd_notes || '',
    priority: order.priority || 5,
    status: order.status || 'draft',
    notes: order.notes || ''
  });

  let materials: Array<{
    material_type: string;
    thickness: string;
    color: string;
    ral_code: string;
    quantity: number;
    unit: string;
  }> = $state([]);

  let errors: Record<string, string> = $state({});
  let submitting = $state(false);

  function validate() {
    errors = {};

    if (!formData.title) errors.title = 'Title is required';
    if (!formData.client) errors.client = 'Client is required';
    if (!formData.due_date) errors.due_date = 'Due date is required';

    if (formData.priority < 0 || formData.priority > 10) {
      errors.priority = 'Priority must be between 0 and 10';
    }

    return Object.keys(errors).length === 0;
  }

  function addMaterial() {
    materials = [...materials, {
      material_type: '',
      thickness: '',
      color: '',
      ral_code: '',
      quantity: 1,
      unit: 'pcs'
    }];
  }

  function removeMaterial(index: number) {
    materials = materials.filter((_, i) => i !== index);
  }

  async function handleSubmit() {
    if (!validate()) return;

    submitting = true;

    try {
      const payload = {
        ...formData,
        materials: materials.filter(m => m.material_type)
      };

      onsubmit?.(payload);
    } catch (err) {
      console.error('Form submission error:', err);
    } finally {
      submitting = false;
    }
  }

  function handleCancel() {
    oncancel?.();
  }
</script>

<form class="order-form" onsubmit={preventDefault(handleSubmit)}>
  <div class="form-header">
    <h2>{mode === 'create' ? $t('orders.create_new') : $t('orders.edit_order')}</h2>
  </div>

  <div class="form-body">
    <!-- Basic Information -->
    <section class="form-section">
      <h3>{$t('orders.basic_info')}</h3>

      <div class="form-row">
        <div class="form-group">
          <label for="po_number">
            {$t('orders.po_number')}
            <small class="optional">(optional)</small>
          </label>
          <input
            id="po_number"
            type="text"
            bind:value={formData.po_number}
            placeholder="PO-2026-001"
          />
        </div>

        <div class="form-group">
          <label for="status">{$t('orders.status')}</label>
          <select id="status" bind:value={formData.status}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div class="form-group" class:has-error={errors.title}>
        <label for="title">
          {$t('orders.title')}
          <span class="required">*</span>
        </label>
        <input
          id="title"
          type="text"
          bind:value={formData.title}
          placeholder="Large Format Signage"
          required
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
        />
        {#if errors.title}
          <span class="error-message" id="title-error">{errors.title}</span>
        {/if}
      </div>

      <div class="form-group" class:has-error={errors.client}>
        <label for="client">
          {$t('orders.client')}
          <span class="required">*</span>
        </label>
        <input
          id="client"
          type="text"
          bind:value={formData.client}
          placeholder="ACME Corporation"
          required
          aria-invalid={!!errors.client}
        />
        {#if errors.client}
          <span class="error-message">{errors.client}</span>
        {/if}
      </div>

      <div class="form-row">
        <div class="form-group" class:has-error={errors.due_date}>
          <label for="due_date">
            {$t('orders.due_date')}
            <span class="required">*</span>
          </label>
          <input
            id="due_date"
            type="date"
            bind:value={formData.due_date}
            required
            min={new Date().toISOString().split('T')[0]}
          />
          {#if errors.due_date}
            <span class="error-message">{errors.due_date}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="loading_date">
            {$t('orders.loading_date')}
            <small class="optional">(optional)</small>
          </label>
          <input
            id="loading_date"
            type="date"
            bind:value={formData.loading_date}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div class="form-group" class:has-error={errors.priority}>
        <label for="priority">
          {$t('orders.priority')}
          <span class="priority-value">{formData.priority}/10</span>
        </label>
        <input
          id="priority"
          type="range"
          min="0"
          max="10"
          bind:value={formData.priority}
          aria-valuemin="0"
          aria-valuemax="10"
          aria-valuenow={formData.priority}
        />
        {#if errors.priority}
          <span class="error-message">{errors.priority}</span>
        {/if}
      </div>
    </section>

    <!-- R&D Section -->
    <section class="form-section">
      <div class="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            bind:checked={formData.is_rd}
          />
          <span>{$t('orders.rd_order')}</span>
        </label>
      </div>

      {#if formData.is_rd}
        <div class="form-group">
          <label for="rd_notes">{$t('orders.rd_notes')}</label>
          <textarea
            id="rd_notes"
            bind:value={formData.rd_notes}
            rows="3"
            placeholder="Experimental process, special materials, etc."
></textarea>
        </div>
      {/if}
    </section>

    <!-- Materials Section -->
    <section class="form-section">
      <div class="section-header">
        <h3>{$t('orders.materials')}</h3>
        <button type="button" class="btn btn-sm btn-outline" onclick={addMaterial}>
          + Add Material
        </button>
      </div>

      {#each materials as material, index (index)}
        <div class="material-item">
          <div class="material-header">
            <span>Material {index + 1}</span>
            <button
              type="button"
              class="btn-icon"
              onclick={() => removeMaterial(index)}
              aria-label="Remove material"
            >
              ×
            </button>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Type</label>
              <input type="text" bind:value={material.material_type} placeholder="Acrylic" />
            </div>

            <div class="form-group">
              <label>Thickness</label>
              <input type="text" bind:value={material.thickness} placeholder="3mm" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Color</label>
              <input type="text" bind:value={material.color} placeholder="Red" />
            </div>

            <div class="form-group">
              <label>RAL Code</label>
              <input type="text" bind:value={material.ral_code} placeholder="RAL 3020" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Quantity</label>
              <input type="number" bind:value={material.quantity} min="0" step="0.01" />
            </div>

            <div class="form-group">
              <label>Unit</label>
              <select bind:value={material.unit}>
                <option value="pcs">Pieces</option>
                <option value="sqm">Square Meters</option>
                <option value="lm">Linear Meters</option>
                <option value="kg">Kilograms</option>
                <option value="sheets">Sheets</option>
              </select>
            </div>
          </div>
        </div>
      {/each}
    </section>

    <!-- Notes Section -->
    <section class="form-section">
      <div class="form-group">
        <label for="notes">{$t('orders.notes')}</label>
        <textarea
          id="notes"
          bind:value={formData.notes}
          rows="4"
          placeholder="Additional instructions, special requirements, etc."
></textarea>
      </div>
    </section>
  </div>

  <div class="form-footer">
    <button type="button" class="btn btn-outline" onclick={handleCancel} disabled={submitting}>
      {$t('common.cancel')}
    </button>
    <button type="submit" class="btn btn-primary" disabled={submitting}>
      {#if submitting}
        {$t('common.saving')}...
      {:else}
        {mode === 'create' ? $t('common.create') : $t('common.save')}
      {/if}
    </button>
  </div>
</form>

<style>
  .order-form {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    max-width: 1100px;
    margin: 0 auto;
    background: var(--bg-1);
    padding: 2rem;
    border-radius: 8px;
  }

  .form-header h2 {
    margin: 0;
    color: var(--text);
  }

  .form-body {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .form-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group.has-error input,
  .form-group.has-error select,
  .form-group.has-error textarea {
    border-color: var(--danger);
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .required {
    color: var(--danger);
  }

  .optional {
    color: var(--muted);
    font-weight: normal;
  }

  .priority-value {
    margin-left: auto;
    color: var(--accent-1);
    font-weight: 700;
  }

  input[type="text"],
  input[type="date"],
  input[type="number"],
  select,
  textarea {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 1rem;
    background: var(--bg-1);
    color: var(--text);
    transition: border-color 0.2s ease;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent-1);
    box-shadow: 0 0 0 3px rgba(var(--accent-1-rgb), 0.1);
  }

  input[type="range"] {
    width: 100%;
    height: 8px;
    background: var(--bg-2);
    border-radius: 4px;
    outline: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--accent-1);
    border-radius: 50%;
    cursor: pointer;
  }

  input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--accent-1);
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .checkbox-group label {
    flex-direction: row;
    align-items: center;
    cursor: pointer;
  }

  input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
  }

  .error-message {
    color: var(--danger);
    font-size: 0.75rem;
  }

  .material-item {
    padding: 1rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .material-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    color: var(--text);
  }

  .btn-icon {
    background: transparent;
    border: none;
    color: var(--danger);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .btn-icon:hover {
    background: rgba(220, 53, 69, 0.1);
  }

  .form-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }

  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
  }

  .btn-outline:hover:not(:disabled) {
    background: var(--bg-2);
    border-color: var(--accent-1);
  }

  .btn-primary {
    background: var(--accent-1);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-2);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  /* Tablet breakpoint - iPad landscape (1024px and below) */
  @media (max-width: 1024px) {
    .order-form {
      max-width: 100%;
      padding: 1.5rem;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .form-section {
      padding: 1.25rem;
    }
  }

  /* Mobile breakpoint */
  @media (max-width: 640px) {
    .order-form {
      padding: 1rem;
    }

    .form-section {
      padding: 1rem;
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }
  }
</style>
