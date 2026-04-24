<!-- src/lib/profiles/components/fields/Dropdown.svelte -->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';

  let {
    value = $bindable(''),
    options = [],
    label = 'Select',
    required = false,
    disabled = false,
    placeholder = 'Select an option...',
    error = null
  }: {
    value?: string;
    options?: string[];
    label?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    error?: string | null;
  } = $props();
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
    color: var(--text-primary, var(--ink-primary));
  }

  .required {
    color: var(--danger, var(--error));
    margin-left: 2px;
  }

  .select-wrapper {
    position: relative;
  }

  .select-input {
    width: 100%;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    padding-right: 40px;
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-primary, var(--ink-primary));
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }

  .select-input:not(.has-value) {
    color: var(--text-muted, var(--ink-tertiary));
  }

  .select-input:hover:not(:disabled) {
    border-color: var(--primary, var(--brand));
    background: var(--bg-2, var(--bg-2));
  }

  .select-input:focus {
    outline: none;
    border-color: var(--primary, var(--brand));
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 10%, transparent);
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
    color: var(--text-muted, var(--ink-tertiary));
    pointer-events: none;
  }

  .error-message {
    color: var(--danger, var(--error));
    font-size: var(--text-xs, 0.75rem);
  }

  .dropdown.error .select-input {
    border-color: var(--danger, var(--error));
  }

  .dropdown.disabled {
    opacity: 0.6;
  }
</style>
