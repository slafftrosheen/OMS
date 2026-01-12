<script lang="ts">
  export let value: string = '';
  export let label: string = 'Dimension';
  export let unit: string = 'mm';
  export let placeholder: string = '0';
  export let required: boolean = false;
  export let min: number = 0;

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const numValue = parseFloat(target.value);
    
    if (!isNaN(numValue) && numValue < min) {
      target.value = min.toString();
      value = target.value;
    }
  }
</script>

<div class="dimension-input">
  <label class="label">
    {label}
    {#if required}<span class="required">*</span>{/if}
  </label>
  <div class="input-wrapper">
    <input
      type="number"
      bind:value
      {placeholder}
      {required}
      {min}
      step="any"
      class="dim-input"
      on:input={handleInput}
    />
    <span class="unit">{unit}</span>
  </div>
</div>

<style>
  .dimension-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
  }

  .required {
    color: var(--danger);
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .dim-input {
    width: 100%;
    padding: var(--space-sm) calc(var(--space-md) + 32px) var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    font: inherit;
    line-height: 1.4;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .dim-input:focus-visible {
    border-color: var(--focus);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--focus) 28%, transparent);
    outline: none;
  }

  .unit {
    position: absolute;
    right: var(--space-md);
    font-size: 0.875rem;
    color: var(--muted);
    pointer-events: none;
  }

  /* Remove spinner buttons for number input */
  .dim-input::-webkit-inner-spin-button,
  .dim-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .dim-input[type='number'] {
    -moz-appearance: textfield;
  }
</style>
