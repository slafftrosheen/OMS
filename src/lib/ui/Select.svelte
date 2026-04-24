<script lang="ts">
  import type { Snippet } from 'svelte';

  type Size = 'sm' | 'md' | 'lg';

  type Props = {
    value?: string;
    options?: { label: string; value: string; disabled?: boolean }[];
    label?: string;
    hint?: string;
    errorText?: string;
    size?: Size;
    disabled?: boolean;
    error?: boolean;
    required?: boolean;
    placeholder?: string;
    name?: string;
    id?: string;
    ariaLabel?: string;
    class?: string;
    onchange?: (e: Event) => void;
    leading?: Snippet;
  };

  let {
    value = $bindable<string>(''),
    options = [],
    label,
    hint,
    errorText,
    size = 'md',
    disabled = false,
    error = false,
    required = false,
    placeholder,
    name,
    id,
    ariaLabel,
    class: className = '',
    onchange,
    leading
  }: Props = $props();

  const inputId = $derived(id ?? (name ? `rf-select-${name}` : undefined));

  function handleChange(e: Event) {
    value = (e.target as HTMLSelectElement).value;
    onchange?.(e);
  }
</script>

<div
  class={['rf-field', className].filter(Boolean).join(' ')}
  data-size={size}
  data-invalid={error ? '' : null}
  data-disabled={disabled ? '' : null}
>
  {#if label}
    <label class="rf-field__label" for={inputId}>
      {label}{#if required}<span class="rf-field__required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <div class="rf-field__control rf-field__control--select">
    {#if leading}
      <span class="rf-field__adornment rf-field__adornment--leading">{@render leading()}</span>
    {/if}

    <select
      {value}
      {disabled}
      {required}
      {name}
      id={inputId}
      aria-label={ariaLabel ?? label}
      aria-invalid={error || undefined}
      class="rf-field__select"
      onchange={handleChange}
    >
      {#if placeholder}
        <option value="" disabled selected={!value}>{placeholder}</option>
      {/if}
      {#each options as o}
        <option value={o.value} disabled={o.disabled}>{o.label}</option>
      {/each}
    </select>

    <span class="rf-field__chevron" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4l4 4 4-4"/>
      </svg>
    </span>
  </div>

  {#if hint && !(error && errorText)}
    <div class="rf-field__hint">{hint}</div>
  {/if}
  {#if error && errorText}
    <div class="rf-field__error" role="alert">{errorText}</div>
  {/if}
</div>

<style>
  .rf-field { display: flex; flex-direction: column; gap: var(--space-xs); width: 100%; }
  .rf-field__label { font-size: var(--text-sm); font-weight: 600; color: var(--ink-secondary); letter-spacing: var(--tracking-tight); }
  .rf-field__required { color: var(--error); margin-left: 2px; }

  .rf-field__control {
    position: relative;
    display: flex;
    align-items: center;
    background: color-mix(in oklab, var(--bg-1) 55%, var(--bg-0));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition:
      border-color var(--motion-sm) var(--ease-standard),
      background   var(--motion-sm) var(--ease-standard),
      box-shadow   var(--motion-sm) var(--ease-standard);
  }
  .rf-field__control:focus-within {
    border-color: var(--brand);
    background: var(--bg-1);
    box-shadow: var(--focus-ring);
  }
  .rf-field[data-invalid] .rf-field__control { border-color: var(--error); }
  .rf-field[data-invalid] .rf-field__control:focus-within { box-shadow: 0 0 0 3px color-mix(in oklab, var(--error) 30%, transparent); }
  .rf-field[data-disabled] .rf-field__control { opacity: 0.55; cursor: not-allowed; background: var(--bg-2); }

  .rf-field__select {
    flex: 1;
    min-width: 0;
    appearance: none;
    -webkit-appearance: none;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-family: inherit;
    font-size: var(--text-md);
    line-height: var(--leading-snug);
    padding: var(--space-sm) var(--space-md);
    padding-right: var(--space-xl);
    cursor: pointer;
  }
  .rf-field__select:disabled { cursor: not-allowed; }
  .rf-field[data-size="sm"] .rf-field__select { font-size: var(--text-sm); padding: var(--space-xs) var(--space-sm); padding-right: var(--space-lg); }
  .rf-field[data-size="lg"] .rf-field__select { font-size: var(--text-lg); padding: var(--space-md) var(--space-lg); padding-right: var(--space-2xl); }

  .rf-field__chevron {
    position: absolute;
    right: var(--space-sm);
    color: var(--ink-tertiary);
    pointer-events: none;
    display: inline-flex;
    align-items: center;
  }

  .rf-field__adornment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0 0 var(--space-md);
    color: var(--ink-tertiary);
    flex-shrink: 0;
  }

  .rf-field__hint  { font-size: var(--text-xs); color: var(--muted); }
  .rf-field__error { font-size: var(--text-xs); color: var(--error); }
</style>
