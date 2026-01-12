<!-- src/lib/profiles/components/fields/Dropdown.svelte -->
<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  export let value: string = '';
  export let options: string[] = [];
  export let label: string = 'Select';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let placeholder: string = 'Select an option...';
  export let error: string | null = null;
</script>

<div class="dropdown" class:disabled class:error={!!error}>
  <label class="label">
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <div class="select-wrapper">
    <select 
      bind:value 
      {disabled}
      class="select-input"
      class:has-value={!!value}
    >
      <option value="" disabled selected>{placeholder}</option>
      {#each options as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
    <ChevronDown size={20} class="chevron" />
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
</div>

<style>
  .dropdown {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .label {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .required {
    color: var(--danger, #dc2626);
    margin-left: 2px;
  }

  .select-wrapper {
    position: relative;
  }

  .select-input {
    width: 100%;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    padding-right: 40px;
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-primary, #1a1a1a);
    cursor: pointer;
    transition: all 0.15s ease;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }

  .select-input:not(.has-value) {
    color: var(--text-muted, #6b7280);
  }

  .select-input:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
    background: var(--bg-2, #f9fafb);
  }

  .select-input:focus {
    outline: none;
    border-color: var(--primary, #3b82f6);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .select-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select-wrapper :global(.chevron) {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted, #6b7280);
    pointer-events: none;
  }

  .error-message {
    color: var(--danger, #dc2626);
    font-size: var(--text-xs, 0.75rem);
  }

  .dropdown.error .select-input {
    border-color: var(--danger, #dc2626);
  }

  .dropdown.disabled {
    opacity: 0.6;
  }
</style>
