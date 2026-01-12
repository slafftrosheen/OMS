<!-- src/lib/profiles/components/fields/DimensionInput.svelte -->
<script lang="ts">
  import { Ruler } from 'lucide-svelte';

  export let value: { width?: number; height?: number; depth?: number } = {};
  export let label: string = 'Dimensions';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let unit: string = 'mm';
  export let fields: string[] = ['width', 'height']; // Which dimensions to show
  export let error: string | null = null;

  const labels: Record<string, string> = {
    width: 'Width',
    height: 'Height',
    depth: 'Depth',
    length: 'Length'
  };

  function handleInput(field: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const val = parseFloat(target.value);
    value = { ...value, [field]: isNaN(val) ? undefined : val };
  }
</script>

<div class="dimension-input" class:disabled class:error={!!error}>
  <label class="label">
    <Ruler size={14} />
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <div class="fields-grid">
    {#each fields as field}
      <div class="dimension-field">
        <label class="field-label">{labels[field]}</label>
        <div class="input-wrapper">
          <input
            type="number"
            value={value[field] || ''}
            on:input={(e) => handleInput(field, e)}
            placeholder="0"
            {disabled}
            class="dimension-value"
            step="0.1"
            min="0"
          />
          <span class="unit">{unit}</span>
        </div>
      </div>
    {/each}
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
</div>

<style>
  .dimension-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
  }

  .label {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 4px);
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .required {
    color: var(--danger, #dc2626);
    margin-left: 2px;
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-sm, 8px);
  }

  .dimension-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .field-label {
    font-size: var(--text-xs, 0.75rem);
    font-weight: 500;
    color: var(--text-muted, #6b7280);
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    padding-right: var(--space-sm, 8px);
    transition: border-color 0.15s ease;
  }

  .input-wrapper:focus-within {
    border-color: var(--primary, #3b82f6);
  }

  .dimension-value {
    flex: 1;
    padding: var(--space-sm, 8px);
    border: none;
    background: none;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    outline: none;
  }

  .dimension-value::-webkit-outer-spin-button,
  .dimension-value::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .dimension-value[type=number] {
    -moz-appearance: textfield;
  }

  .unit {
    font-size: var(--text-xs, 0.75rem);
    font-weight: 500;
    color: var(--text-muted, #6b7280);
  }

  .error-message {
    color: var(--danger, #dc2626);
    font-size: var(--text-xs, 0.75rem);
  }

  .dimension-input.error .input-wrapper {
    border-color: var(--danger, #dc2626);
  }

  .dimension-input.disabled {
    opacity: 0.6;
  }
</style>
