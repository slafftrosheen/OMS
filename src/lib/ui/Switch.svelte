<script lang="ts">
  type Size = 'sm' | 'md' | 'lg';

  let {
    checked = $bindable(false),
    disabled = false,
    label,
    labelPosition = 'right',
    size = 'md',
    name,
    id,
    onchange
  }: {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    labelPosition?: 'left' | 'right';
    size?: Size;
    name?: string;
    id?: string;
    onchange?: (checked: boolean) => void;
  } = $props();

  const inputId = $derived(id ?? (name ? `rf-switch-${name}` : `rf-switch-${Math.random().toString(36).slice(2)}`));

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    checked = target.checked;
    onchange?.(checked);
  }
</script>

<label
  class="rf-switch-wrap"
  data-size={size}
  data-disabled={disabled || null}
  data-label-pos={labelPosition}
  for={inputId}
>
  {#if label && labelPosition === 'left'}
    <span class="rf-switch__label">{label}</span>
  {/if}

  <span class="rf-switch" data-checked={checked || null} aria-hidden="true">
    <span class="rf-switch__thumb"></span>
  </span>

  <input
    type="checkbox"
    id={inputId}
    {name}
    {disabled}
    bind:checked
    onchange={handleChange}
    class="rf-switch__input"
    role="switch"
    aria-checked={checked}
  />

  {#if label && labelPosition === 'right'}
    <span class="rf-switch__label">{label}</span>
  {/if}
</label>

<style>
  .rf-switch-wrap {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .rf-switch-wrap[data-disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Hidden real checkbox */
  .rf-switch__input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* Track */
  .rf-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    border-radius: var(--radius-full);
    background: var(--bg-3, var(--bg-2));
    border: 2px solid transparent;
    transition:
      background   var(--motion-sm) var(--ease-standard),
      box-shadow   var(--motion-sm) var(--ease-standard);
    flex-shrink: 0;
  }

  /* Sizes */
  .rf-switch-wrap[data-size="sm"]  .rf-switch { width: 32px; height: 18px; }
  .rf-switch-wrap[data-size="md"]  .rf-switch { width: 42px; height: 24px; }
  .rf-switch-wrap[data-size="lg"]  .rf-switch { width: 52px; height: 30px; }

  /* Checked track */
  .rf-switch[data-checked] {
    background: var(--brand);
    box-shadow: inset 0 0 0 2px transparent;
  }

  /* Thumb */
  .rf-switch__thumb {
    position: absolute;
    border-radius: var(--radius-full);
    background: white;
    box-shadow: var(--elevation-2);
    transition:
      transform  var(--motion-sm) var(--ease-spring-soft),
      width      var(--motion-xs) var(--ease-emphasized);
  }

  .rf-switch-wrap[data-size="sm"] .rf-switch__thumb { width: 12px; height: 12px; left: 2px; }
  .rf-switch-wrap[data-size="md"] .rf-switch__thumb { width: 16px; height: 16px; left: 3px; }
  .rf-switch-wrap[data-size="lg"] .rf-switch__thumb { width: 22px; height: 22px; left: 2px; }

  .rf-switch-wrap[data-size="sm"] .rf-switch[data-checked] .rf-switch__thumb { transform: translateX(14px); }
  .rf-switch-wrap[data-size="md"] .rf-switch[data-checked] .rf-switch__thumb { transform: translateX(18px); }
  .rf-switch-wrap[data-size="lg"] .rf-switch[data-checked] .rf-switch__thumb { transform: translateX(22px); }

  /* Stretch thumb on press */
  .rf-switch-wrap:active .rf-switch__thumb {
    width: calc(100% - 10px);
  }

  /* Focus */
  .rf-switch__input:focus-visible + * .rf-switch,
  .rf-switch-wrap:focus-within .rf-switch {
    box-shadow: var(--focus-ring);
  }

  /* Label */
  .rf-switch__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--ink-primary);
    line-height: 1;
  }
</style>
