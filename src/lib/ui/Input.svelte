<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  type Size = 'sm' | 'md' | 'lg';

  type Props = {
    value?: string;
    placeholder?: string;
    type?: string;
    label?: string;
    hint?: string;
    errorText?: string;
    size?: Size;
    disabled?: boolean;
    readonly?: boolean;
    error?: boolean;
    autofocus?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    iconLeft?: IconName;
    iconRight?: IconName;
    ariaLabel?: string;
    class?: string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    onfocus?: (e: FocusEvent) => void;
    onblur?: (e: FocusEvent) => void;
    leading?: Snippet;
    trailing?: Snippet;
  };

  let {
    value = $bindable<string>(''),
    placeholder = '',
    type = 'text',
    label,
    hint,
    errorText,
    size = 'md',
    disabled = false,
    readonly = false,
    error = false,
    autofocus = false,
    required = false,
    name,
    id,
    iconLeft,
    iconRight,
    ariaLabel,
    class: className = '',
    oninput,
    onchange,
    onfocus,
    onblur,
    leading,
    trailing
  }: Props = $props();

  const inputId = $derived(id ?? (name ? `rf-input-${name}` : undefined));
  const describedBy = $derived(
    [
      hint  ? `${inputId}-hint`  : null,
      error && errorText ? `${inputId}-error` : null
    ].filter(Boolean).join(' ') || undefined
  );

  function handleInput(e: Event) {
    const t = e.target as HTMLInputElement;
    value = t.value;
    oninput?.(e);
  }
</script>

<div class={['rf-field', className].filter(Boolean).join(' ')} data-size={size} data-invalid={error ? '' : null} data-disabled={disabled ? '' : null}>
  {#if label}
    <label class="rf-field__label" for={inputId}>
      {label}{#if required}<span class="rf-field__required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <div class="rf-field__control">
    {#if iconLeft}
      <span class="rf-field__adornment rf-field__adornment--leading" aria-hidden="true">
        <Icon name={iconLeft} size="sm" />
      </span>
    {:else if leading}
      <span class="rf-field__adornment rf-field__adornment--leading">{@render leading()}</span>
    {/if}

    <input
      {value}
      {type}
      {placeholder}
      {disabled}
      {readonly}
      {required}
      {autofocus}
      {name}
      id={inputId}
      aria-label={ariaLabel ?? label}
      aria-invalid={error || undefined}
      aria-describedby={describedBy}
      class="rf-field__input"
      oninput={handleInput}
      {onchange}
      {onfocus}
      {onblur}
    />

    {#if iconRight}
      <span class="rf-field__adornment rf-field__adornment--trailing" aria-hidden="true">
        <Icon name={iconRight} size="sm" />
      </span>
    {:else if trailing}
      <span class="rf-field__adornment rf-field__adornment--trailing">{@render trailing()}</span>
    {/if}
  </div>

  {#if hint && !(error && errorText)}
    <div id="{inputId}-hint" class="rf-field__hint">{hint}</div>
  {/if}
  {#if error && errorText}
    <div id="{inputId}-error" class="rf-field__error" role="alert">{errorText}</div>
  {/if}
</div>

<style>
  .rf-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .rf-field__label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink-secondary);
    letter-spacing: var(--tracking-tight);
  }
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

  .rf-field__control:hover:not([data-disabled]) {
    border-color: color-mix(in oklab, var(--border) 50%, var(--text));
  }

  .rf-field__control:focus-within {
    border-color: var(--brand);
    background: var(--bg-1);
    box-shadow: var(--focus-ring);
  }

  .rf-field[data-invalid] .rf-field__control {
    border-color: var(--error);
  }
  .rf-field[data-invalid] .rf-field__control:focus-within {
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--error) 30%, transparent);
  }

  .rf-field[data-disabled] .rf-field__control {
    opacity: 0.55;
    cursor: not-allowed;
    background: var(--bg-2);
  }

  .rf-field__input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-family: inherit;
    line-height: var(--leading-snug);
    padding: var(--space-sm) var(--space-md);
  }
  .rf-field__input::placeholder { color: var(--muted); opacity: 0.75; }
  .rf-field__input:disabled { cursor: not-allowed; }

  /* Sizes */
  .rf-field[data-size="sm"] .rf-field__input { font-size: var(--text-sm); padding: var(--space-xs) var(--space-sm); }
  .rf-field[data-size="md"] .rf-field__input { font-size: var(--text-md); }
  .rf-field[data-size="lg"] .rf-field__input { font-size: var(--text-lg); padding: var(--space-md) var(--space-lg); }

  /* Adornments */
  .rf-field__adornment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-sm);
    color: var(--ink-tertiary);
  }
  .rf-field__adornment--leading  { padding-left:  var(--space-md); padding-right: 0; }
  .rf-field__adornment--trailing { padding-right: var(--space-md); padding-left:  0; }

  .rf-field__adornment--leading ~ .rf-field__input { padding-left: var(--space-sm); }
  .rf-field__input + .rf-field__adornment--trailing { padding-left: 0; }

  /* Hint & error */
  .rf-field__hint  { font-size: var(--text-xs); color: var(--muted); }
  .rf-field__error { font-size: var(--text-xs); color: var(--error); }
</style>
