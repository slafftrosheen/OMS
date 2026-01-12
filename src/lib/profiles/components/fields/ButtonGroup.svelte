<!-- src/lib/profiles/components/fields/ButtonGroup.svelte -->
<script lang="ts">
  export let value: string = '';
  export let options: string[] = [];
  export let label: string = '';
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let visualStyle: 'buttons' | 'boxes' = 'buttons';
  export let multiSelect: boolean = false;

  let selectedValues: string[] = [];

  $: if (!multiSelect && value) {
    selectedValues = [value];
  }

  function selectOption(option: string) {
    if (disabled) return;

    if (multiSelect) {
      if (selectedValues.includes(option)) {
        selectedValues = selectedValues.filter(v => v !== option);
      } else {
        selectedValues = [...selectedValues, option];
      }
      value = selectedValues.join(',');
    } else {
      value = option;
      selectedValues = [option];
    }
  }

  function getBoxColor(option: string): string {
    // Smart color detection from option text
    if (option.includes('WHITE') || option.includes('3000K')) return '#FFF9E6';
    if (option.includes('6000K') || option.includes('6500K')) return '#FFFFFF';
    if (option.includes('9000K')) return '#E8F4FF';
    if (option.includes('BLACK')) return '#000000';
    if (option.includes('RED')) return '#E60000';
    if (option.includes('BLUE')) return '#003087';
    return '#E5E7EB';
  }

  function getTextColor(bgColor: string): string {
    return bgColor === '#000000' || bgColor === '#003087' ? '#fff' : '#000';
  }
</script>

<div class="button-group">
  {#if label}
    <label class="label">
      {label}
      {#if required}
        <span class="required">*</span>
      {/if}
    </label>
  {/if}

  <div class="options-container" class:boxes-style={visualStyle === 'boxes'}>
    {#each options as option}
      {@const bgColor = getBoxColor(option)}
      {@const textColor = getTextColor(bgColor)}
      
      <button
        type="button"
        class="option-button"
        class:selected={selectedValues.includes(option)}
        class:box-style={visualStyle === 'boxes'}
        style={visualStyle === 'boxes' ? `background-color: ${bgColor}; color: ${textColor}; border: 2px solid ${selectedValues.includes(option) ? '#000' : '#ccc'};` : ''}
        on:click={() => selectOption(option)}
        {disabled}
      >
        {option}
      </button>
    {/each}
  </div>
</div>

<style>
  .button-group {
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
  }

  .options-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs, 4px);
  }

  .options-container.boxes-style {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-sm, 8px);
  }

  .option-button {
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--bg-2, #f9fafb);
    border: 2px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    white-space: nowrap;
  }

  .option-button:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
    transform: translateY(-1px);
  }

  .option-button.selected {
    border-color: var(--primary, #3b82f6);
    background: var(--primary, #3b82f6);
    color: white;
  }

  .option-button.box-style {
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
  }

  .option-button.box-style.selected {
    box-shadow: 0 0 0 3px var(--primary, #3b82f6);
  }

  .option-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
