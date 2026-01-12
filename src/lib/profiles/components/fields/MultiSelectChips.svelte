<!-- src/lib/profiles/components/fields/MultiSelectChips.svelte -->
<script lang="ts">
  import { X } from 'lucide-svelte';

  export let value: string[] = [];
  export let options: string[] = [];
  export let label: string = 'Select options';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let maxSelections: number | null = null;
  export let error: string | null = null;

  function toggleOption(option: string) {
    if (disabled) return;

    if (value.includes(option)) {
      value = value.filter(v => v !== option);
    } else {
      if (maxSelections && value.length >= maxSelections) {
        return; // Max selections reached
      }
      value = [...value, option];
    }
  }

  function removeOption(option: string) {
    value = value.filter(v => v !== option);
  }
</script>

<div class="multi-select-chips" class:disabled class:error={!!error}>
  <label class="label">
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
    {#if maxSelections}
      <span class="max-info">
        ({value.length}/{maxSelections})
      </span>
    {/if}
  </label>

  <div class="chips-container">
    {#each options as option}
      <button
        type="button"
        class="chip"
        class:selected={value.includes(option)}
        class:disabled-chip={maxSelections && value.length >= maxSelections && !value.includes(option)}
        on:click={() => toggleOption(option)}
        {disabled}
      >
        {option}
        {#if value.includes(option)}
          <div class="check-mark">✓</div>
        {/if}
      </button>
    {/each}
  </div>

  {#if value.length > 0}
    <div class="selected-chips">
      <span class="selected-label">Selected:</span>
      {#each value as selected}
        <div class="selected-chip">
          {selected}
          {#if !disabled}
            <button
              type="button"
              class="remove-button"
              on:click={() => removeOption(selected)}
              title="Remove {selected}"
            >
              <X size={12} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
</div>

<style>
  .multi-select-chips {
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

  .max-info {
    font-size: var(--text-xs, 0.75rem);
    font-weight: 400;
    color: var(--text-muted, #6b7280);
  }

  .chips-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm, 8px);
  }

  .chip {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-xs, 4px);
    padding: var(--space-xs, 4px) var(--space-md, 12px);
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 500;
    color: var(--text-primary, #1a1a1a);
  }

  .chip:hover:not(:disabled):not(.disabled-chip) {
    border-color: var(--primary, #3b82f6);
    background: var(--bg-3, #f3f4f6);
  }

  .chip.selected {
    background: var(--primary, #3b82f6);
    border-color: var(--primary, #3b82f6);
    color: white;
    padding-right: var(--space-lg, 16px);
  }

  .chip.disabled-chip {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .check-mark {
    position: absolute;
    right: 8px;
    font-size: var(--text-xs, 0.75rem);
    font-weight: 700;
  }

  .selected-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs, 4px);
    padding: var(--space-sm, 8px);
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
  }

  .selected-label {
    font-size: var(--text-xs, 0.75rem);
    font-weight: 600;
    color: var(--text-muted, #6b7280);
    margin-right: var(--space-xs, 4px);
  }

  .selected-chip {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 4px);
    padding: 4px 8px;
    background: var(--primary, #3b82f6);
    color: white;
    border-radius: var(--radius-full, 9999px);
    font-size: var(--text-xs, 0.75rem);
    font-weight: 600;
  }

  .remove-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .remove-button:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .error-message {
    color: var(--danger, #dc2626);
    font-size: var(--text-xs, 0.75rem);
  }

  .multi-select-chips.error .chips-container {
    border: 1px solid var(--danger, #dc2626);
    border-radius: var(--radius-md, 6px);
    padding: var(--space-sm, 8px);
  }

  .multi-select-chips.disabled {
    opacity: 0.6;
  }
</style>
