<!-- src/lib/profiles/components/fields/ThicknessSelector.svelte -->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';

  interface Props {
    value?: number;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    unit?: string;
    step?: number;
    min?: number;
    max?: number;
    standardOptions?: number[]; // e.g., [1.5, 2, 3, 5, 10]
    error?: string | null;
  }

  let {
    value = $bindable(0),
    label = 'Thickness',
    required = false,
    disabled = false,
    unit = 'mm',
    step = 0.5,
    min = 0,
    max = 100,
    standardOptions = [],
    error = null
  }: Props = $props();

  let isDropdownOpen = $state(false);
  let inputElement: HTMLInputElement = $state();

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
      onclick={decrement}
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
        oninput={handleInput}
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
      onclick={increment}
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
          onclick={toggleDropdown}
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
                onclick={() => selectStandard(thickness)}
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
    color: var(--text-primary, var(--ink-primary));
  }

  .required {
    color: var(--danger, var(--error));
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
    background: var(--bg-2, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    color: var(--text-primary, var(--ink-primary));
  }

  .control-button:hover:not(:disabled) {
    background: var(--bg-3, var(--bg-2));
    border-color: var(--primary, var(--brand));
    color: var(--primary, var(--brand));
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
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    padding-right: var(--space-md, 12px);
    transition: border-color 0.15s ease;
  }

  .input-container:focus-within {
    border-color: var(--primary, var(--brand));
  }

  .thickness-input {
    flex: 1;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    border: none;
    background: none;
    font-size: var(--text-md, 1rem);
    font-weight: 600;
    color: var(--text-primary, var(--ink-primary));
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
    color: var(--text-muted, var(--ink-tertiary));
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
    background: var(--bg-2, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    color: var(--text-primary, var(--ink-primary));
  }

  .dropdown-toggle:hover:not(:disabled) {
    background: var(--bg-3, var(--bg-2));
    border-color: var(--primary, var(--brand));
    color: var(--primary, var(--brand));
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
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 15%, transparent);
    z-index: var(--z-overlay);
    overflow: hidden;
  }

  .dropdown-item {
    width: 100%;
    display: block;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: none;
    border: none;
    border-bottom: 1px solid var(--border, var(--border));
    cursor: pointer;
    text-align: center;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    transition: background 0.15s ease;
    color: var(--text-primary, var(--ink-primary));
  }

  .dropdown-item:last-child {
    border-bottom: none;
  }

  .dropdown-item:hover {
    background: var(--bg-2, var(--bg-2));
  }

  .dropdown-item.active {
    background: var(--primary-bg, var(--brand-soft));
    color: var(--primary, var(--brand));
  }

  .error-message {
    color: var(--danger, var(--error));
    font-size: var(--text-xs, 0.75rem);
    margin-top: 2px;
  }

  .thickness-selector.error .input-container {
    border-color: var(--danger, var(--error));
  }

  .thickness-selector.disabled {
    opacity: 0.6;
  }
</style>
