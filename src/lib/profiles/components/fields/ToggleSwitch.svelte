<!-- src/lib/profiles/components/fields/ToggleSwitch.svelte -->
<script lang="ts">
  export let value: boolean = false;
  export let label: string = 'Toggle';
  export let disabled: boolean = false;
  export let error: string | null = null;

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
    on:click={toggle}
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
    color: var(--text-primary, #1a1a1a);
    flex: 1;
  }

  .switch {
    position: relative;
    width: 52px;
    height: 28px;
    background: var(--bg-3, #f3f4f6);
    border: 2px solid var(--border, #e5e7eb);
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;
  }

  .switch:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
  }

  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .switch.active {
    background: var(--primary, #3b82f6);
    border-color: var(--primary, #3b82f6);
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
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .switch.active .slider {
    transform: translateX(24px);
  }

  .error-message {
    color: var(--danger, #dc2626);
    font-size: var(--text-xs, 0.75rem);
  }

  .toggle-switch.error .switch {
    border-color: var(--danger, #dc2626);
  }

  .toggle-switch.disabled {
    opacity: 0.6;
  }
</style>
