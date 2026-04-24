<script lang="ts">
  type Option<T extends string = string> = { value: T; label: string; icon?: string };

  let {
    value = $bindable(''),
    options = [],
    size = 'md',
    disabled = false,
    name,
    onchange
  }: {
    value?: string;
    options?: Option[];
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    name?: string;
    onchange?: (v: string) => void;
  } = $props();

  function select(v: string) {
    if (disabled) return;
    value = v;
    onchange?.(v);
  }

  function onKey(e: KeyboardEvent, idx: number) {
    const { key } = e;
    if (!['ArrowRight', 'ArrowLeft'].includes(key)) return;
    e.preventDefault();
    const next = key === 'ArrowRight'
      ? Math.min(idx + 1, options.length - 1)
      : Math.max(idx - 1, 0);
    if (next !== idx) select(options[next].value);
  }
</script>

<div
  class="rf-seg"
  data-size={size}
  data-disabled={disabled || null}
  role="group"
  aria-label={name}
>
  {#each options as opt, i}
    {@const active = value === opt.value}
    <button
      type="button"
      class="rf-seg__item"
      aria-pressed={active}
      tabindex={active ? 0 : -1}
      {disabled}
      onclick={() => select(opt.value)}
      onkeydown={(e) => onKey(e, i)}
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .rf-seg {
    display: inline-flex;
    align-items: center;
    background: var(--bg-2);
    border-radius: var(--radius-full);
    padding: 3px;
    gap: 2px;
  }
  .rf-seg[data-disabled] { opacity: 0.5; pointer-events: none; }

  .rf-seg__item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--ink-secondary);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      box-shadow var(--motion-sm) var(--ease-standard);
    -webkit-tap-highlight-color: transparent;
  }

  .rf-seg[data-size="sm"] .rf-seg__item { font-size: var(--text-xs); padding: 2px var(--space-sm); }
  .rf-seg[data-size="md"] .rf-seg__item { font-size: var(--text-sm); padding: var(--space-xs) var(--space-md); }
  .rf-seg[data-size="lg"] .rf-seg__item { font-size: var(--text-md); padding: var(--space-sm) var(--space-lg); }

  .rf-seg__item:hover {
    color: var(--ink-primary);
  }

  .rf-seg__item[aria-pressed="true"] {
    background: var(--bg-0);
    color: var(--ink-primary);
    font-weight: 600;
    box-shadow: var(--elevation-1);
  }

  .rf-seg__item:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
