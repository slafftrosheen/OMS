<script lang="ts">
  export let value: string = '';
  export let placeholder = '';
  export let type: string = 'text';
  export let ariaLabel = placeholder || 'input';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled = false;
  export let error = false;

  const handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement | null;
    value = target ? target.value : '';
  };
</script>

<input
  {value}
  {disabled}
  type={type}
  placeholder={placeholder}
  aria-label={ariaLabel}
  aria-invalid={error}
  class="rf-input"
  data-size={size}
  on:input={handleInput} />

<style>
  .rf-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md, 0.5rem);
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    font: inherit;
    line-height: 1.5;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  .rf-input[data-size="sm"] {
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.8125rem;
    border-radius: var(--radius-sm, 0.375rem);
  }

  .rf-input[data-size="lg"] {
    padding: var(--space-md) var(--space-lg);
    font-size: 1rem;
    border-radius: var(--radius-lg, 0.625rem);
  }

  .rf-input:hover:not(:disabled):not(:focus) {
    border-color: color-mix(in oklab, var(--border) 60%, var(--text));
  }

  .rf-input:focus {
    outline: none;
    border-color: var(--accent-1, var(--focus, #3b82f6));
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent-1, var(--focus, #3b82f6)) 20%, transparent);
  }

  .rf-input[aria-invalid="true"] {
    border-color: var(--danger, #dc2626);
  }

  .rf-input[aria-invalid="true"]:focus {
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--danger, #dc2626) 20%, transparent);
  }

  .rf-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--bg-1);
  }

  .rf-input::placeholder {
    color: var(--muted);
    opacity: 0.7;
  }
</style>
