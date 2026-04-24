<!-- src/lib/profiles/components/fields/ToggleSwitch.svelte -->
<script lang="ts">
  let {
    value = $bindable(false),
    label = 'Toggle',
    disabled = false,
    error = null
  }: {
    value?: boolean;
    label?: string;
    disabled?: boolean;
    error?: string | null;
  } = $props();

  function toggle() {
    if (!disabled) {
      value = !value;
    }
  }
</script>

<div class="toggle-switch" class:disabled class:error={!!error}>
  <label class="label">
    {label}
  </label>

  <button
    type="button"
    class="switch"
    class:active={value}
    onclick={toggle}
    {disabled}
    role="switch"
    aria-checked={value}
  >
    <span class="slider"></span>
  </button>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
</div>

<style>
  .toggle-switch {
    display: flex;
    align-items: center;
    gap: var(--space-md, 12px);
  }

  .label {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, var(--ink-primary));
    flex: 1;
  }

  .switch {
    position: relative;
    width: 52px;
    height: 28px;
    background: var(--bg-3, var(--bg-2));
    border: 2px solid var(--border, var(--border));
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    padding: 0;
  }

  .switch:hover:not(:disabled) {
    border-color: var(--primary, var(--brand));
  }

  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .switch.active {
    background: var(--primary, var(--brand));
    border-color: var(--primary, var(--brand));
  }

  .slider {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px color-mix(in oklab, var(--bg-0) 20%, transparent);
  }

  .switch.active .slider {
    transform: translateX(24px);
  }

  .error-message {
    color: var(--danger, var(--error));
    font-size: var(--text-xs, 0.75rem);
  }

  .toggle-switch.error .switch {
    border-color: var(--danger, var(--error));
  }

  .toggle-switch.disabled {
    opacity: 0.6;
  }
</style>
