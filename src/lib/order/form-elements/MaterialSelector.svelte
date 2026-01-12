<script lang="ts">
  export let value: string = '';
  export let label: string = 'Material';
  export let options: string[] = [];
  export let placeholder: string = 'Select material';
  export let required: boolean = false;
</script>

<div class="material-selector">
  <label class="label">
    {label}
    {#if required}<span class="required">*</span>{/if}
  </label>
  <select
    bind:value
    class="material-select"
    {required}
  >
    <option value="" disabled>{placeholder}</option>
    {#each options as option}
      <option value={option}>{option}</option>
    {/each}
  </select>
</div>

<style>
  .material-selector {
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

  .material-select {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    font: inherit;
    line-height: 1.4;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .material-select:focus-visible {
    border-color: var(--focus);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--focus) 28%, transparent);
    outline: none;
  }

  .material-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
