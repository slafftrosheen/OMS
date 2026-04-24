<script lang="ts">
  type Props = {
    value?: string;
    placeholder?: string;
    label?: string;
    hint?: string;
    errorText?: string;
    rows?: number;
    disabled?: boolean;
    readonly?: boolean;
    error?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    autoResize?: boolean;
    ariaLabel?: string;
    class?: string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
  };

  let {
    value = $bindable<string>(''),
    placeholder = '',
    label,
    hint,
    errorText,
    rows = 3,
    disabled = false,
    readonly = false,
    error = false,
    required = false,
    name,
    id,
    autoResize = false,
    ariaLabel,
    class: className = '',
    oninput,
    onchange
  }: Props = $props();

  const inputId = $derived(id ?? (name ? `rf-textarea-${name}` : undefined));
  let taEl: HTMLTextAreaElement | null = $state(null);

  function handleInput(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    value = t.value;
    if (autoResize) {
      t.style.height = 'auto';
      t.style.height = `${t.scrollHeight}px`;
    }
    oninput?.(e);
  }

  $effect(() => {
    if (autoResize && taEl) {
      taEl.style.height = 'auto';
      taEl.style.height = `${taEl.scrollHeight}px`;
    }
  });
</script>

<div class={['rf-field', className].filter(Boolean).join(' ')} data-invalid={error ? '' : null} data-disabled={disabled ? '' : null}>
  {#if label}
    <label class="rf-field__label" for={inputId}>
      {label}{#if required}<span class="rf-field__required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <div class="rf-field__control">
    <textarea
      bind:this={taEl}
      {value}
      {placeholder}
      {disabled}
      {readonly}
      {required}
      {rows}
      {name}
      id={inputId}
      aria-label={ariaLabel ?? label}
      aria-invalid={error || undefined}
      class="rf-field__textarea"
      oninput={handleInput}
      {onchange}
    ></textarea>
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

  .rf-field__textarea {
    width: 100%;
    border: none; outline: none; background: transparent;
    color: var(--text); font-family: inherit;
    font-size: var(--text-md);
    line-height: var(--leading-normal);
    padding: var(--space-sm) var(--space-md);
    resize: vertical;
    min-height: calc(var(--control-sm) + var(--space-md));
  }
  .rf-field__textarea::placeholder { color: var(--muted); opacity: 0.75; }

  .rf-field__hint  { font-size: var(--text-xs); color: var(--muted); }
  .rf-field__error { font-size: var(--text-xs); color: var(--error); }
</style>
