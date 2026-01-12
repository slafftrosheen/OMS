<!-- src/lib/profiles/components/fields/ThicknessSelector.svelte -->
<script lang="ts">
  import { Minus, Plus, ChevronDown } from 'lucide-svelte';

  export let value: number = 0;
  export let label: string = 'Thickness';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let unit: string = 'mm';
  export let step: number = 0.5;
  export let min: number = 0;
  export let max: number = 100;
  export let standardOptions: number[] = []; // e.g., [1.5, 2, 3, 5, 10]
  export let error: string | null = null;

  let isDropdownOpen = false;
  let inputElement: HTMLInputElement;

  function increment() {
    const newValue = Number((value + step).toFixed(2));
    if (newValue <= max) {
      value = newValue;
    }
  }

  function decrement() {
    const newValue = Number((value - step).toFixed(2));
    if (newValue >= min) {
      value = newValue;
    }
  }

  function selectStandard(thickness: number) {
    value = thickness;
    isDropdownOpen = false;
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const newValue = parseFloat(target.value);
    if (!isNaN(newValue)) {
      value = Math.max(min, Math.min(max, newValue));
    }
  }

  function toggleDropdown() {
    if (standardOptions.length > 0 && !disabled) {
      isDropdownOpen = !isDropdownOpen;
    }
  }
</script>

<div class="thickness-selector" class:disabled class:error={!!error}>
  <label class="label">
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <div class="input-wrapper">
    <button
      type="button"
      class="control-button"
      on:click={decrement}
      {disabled}
      title="Decrease"
    >
      <Minus size={16} />
    </button>

    <div class="input-container">
      <input
        bind:this={inputElement}
        type="number"
        bind:value
        on:input={handleInput}
        {min}
        {max}
        {step}
        {disabled}
        class="thickness-input"
      />
      <span class="unit">{unit}</span>
    </div>

    <button
      type="button"
      class="control-button"
      on:click={increment}
      {disabled}
      title="Increase"
    >
      <Plus size={16} />
    </button>

    {#if standardOptions.length > 0}
      <div class="dropdown-wrapper">
        <button
          type="button"
          class="dropdown-toggle"
          on:click={toggleDropdown}
          {disabled}
          title="Standard thicknesses"
        >
          <ChevronDown size={16} />
        </button>

        {#if isDropdownOpen}
          <div class="dropdown-menu">
            {#each standardOptions as thickness}
              <button
                type="button"
                class="dropdown-item"
                class:active={value === thickness}
                on:click={() => selectStandard(thickness)}
              >
                {thickness}{unit}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
</div>

<style>
  .thickness-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    position: relative;
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

  .input-wrapper {
    display: flex;
    gap: var(--space-xs, 4px);
    align-items: stretch;
  }

  .control-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    padding: 0;
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--text-primary, #1a1a1a);
  }

  .control-button:hover:not(:disabled) {
    background: var(--bg-3, #f3f4f6);
    border-color: var(--primary, #3b82f6);
    color: var(--primary, #3b82f6);
  }

  .control-button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-container {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    padding-right: var(--space-md, 12px);
    transition: border-color 0.15s ease;
  }

  .input-container:focus-within {
    border-color: var(--primary, #3b82f6);
  }

  .thickness-input {
    flex: 1;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    border: none;
    background: none;
    font-size: var(--text-md, 1rem);
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    outline: none;
    text-align: center;
  }

  .thickness-input::-webkit-outer-spin-button,
  .thickness-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .thickness-input[type=number] {
    -moz-appearance: textfield;
  }

  .thickness-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .unit {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 500;
    color: var(--text-muted, #6b7280);
  }

  .dropdown-wrapper {
    position: relative;
  }

  .dropdown-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    padding: 0;
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--text-primary, #1a1a1a);
  }

  .dropdown-toggle:hover:not(:disabled) {
    background: var(--bg-3, #f3f4f6);
    border-color: var(--primary, #3b82f6);
    color: var(--primary, #3b82f6);
  }

  .dropdown-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 120px;
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    overflow: hidden;
  }

  .dropdown-item {
    width: 100%;
    display: block;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: none;
    border: none;
    border-bottom: 1px solid var(--border, #e5e7eb);
    cursor: pointer;
    text-align: center;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    transition: background 0.15s ease;
    color: var(--text-primary, #1a1a1a);
  }

  .dropdown-item:last-child {
    border-bottom: none;
  }

  .dropdown-item:hover {
    background: var(--bg-2, #f9fafb);
  }

  .dropdown-item.active {
    background: var(--primary-bg, #dbeafe);
    color: var(--primary, #3b82f6);
  }

  .error-message {
    color: var(--danger, #dc2626);
    font-size: var(--text-xs, 0.75rem);
    margin-top: 2px;
  }

  .thickness-selector.error .input-container {
    border-color: var(--danger, #dc2626);
  }

  .thickness-selector.disabled {
    opacity: 0.6;
  }
</style>
