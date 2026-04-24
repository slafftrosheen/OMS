<!-- src/lib/profiles/components/fields/DimensionInput.svelte -->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';

  interface Props {
    value?: { width?: number; height?: number; depth?: number };
    label?: string;
    required?: boolean;
    disabled?: boolean;
    unit?: string;
    fields?: string[]; // Which dimensions to show
    error?: string | null;
  }

  let {
    value = $bindable({}),
    label = 'Dimensions',
    required = false,
    disabled = false,
    unit = 'mm',
    fields = ['width', 'height'],
    error = null
  }: Props = $props();

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
            oninput={(e) => handleInput(field, e)}
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
    color: var(--text-primary, var(--ink-primary));
  }

  .required {
    color: var(--danger, var(--error));
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
    color: var(--text-muted, var(--ink-tertiary));
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    padding-right: var(--space-sm, 8px);
    transition: border-color 0.15s ease;
  }

  .input-wrapper:focus-within {
    border-color: var(--primary, var(--brand));
  }

  .dimension-value {
    flex: 1;
    padding: var(--space-sm, 8px);
    border: none;
    background: none;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, var(--ink-primary));
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
    color: var(--text-muted, var(--ink-tertiary));
  }

  .error-message {
    color: var(--danger, var(--error));
    font-size: var(--text-xs, 0.75rem);
  }

  .dimension-input.error .input-wrapper {
    border-color: var(--danger, var(--error));
  }

  .dimension-input.disabled {
    opacity: 0.6;
  }
</style>
