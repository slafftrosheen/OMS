<script lang="ts">
  let {
    label,
    variant = 'white',
    active = false,
    onClick = () => {}
  }: {
    label: string;
    variant?: 'white' | 'black' | 'red' | 'orange';
    active?: boolean;
    onClick?: () => void;
  } = $props();
</script>

<button
  class="section-btn"
  class:white={variant === 'white'}
  class:black={variant === 'black'}
  class:red={variant === 'red'}
  class:orange={variant === 'orange'}
  class:active
  onclick={onClick}
  type="button"
>
  {label}
</button>

<style>
  .section-btn {
    padding: 6px 12px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    white-space: nowrap;
  }

  .section-btn.white {
    background: white;
    color: black;
    border: 1px solid var(--border);
  }

  .section-btn.white:hover {
    background: var(--bg-2);
  }

  .section-btn.black {
    background: var(--ink-primary);
    color: white;
    border: 1px solid var(--ink-primary);
  }

  .section-btn.black:hover {
    background: color-mix(in oklab, var(--ink-primary) 85%, black);
  }

  .section-btn.red {
    background: var(--error);
    color: white;
    border: 1px solid var(--error);
  }

  .section-btn.red:hover {
    background: color-mix(in oklab, var(--error) 85%, black);
  }

  .section-btn.orange {
    background: var(--warn);
    color: black;
    border: 1px solid var(--warn);
    font-weight: bold;
  }

  .section-btn.orange:hover {
    background: color-mix(in oklab, var(--warn) 85%, black);
  }

  .section-btn.active {
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--bg-0) 45%, transparent);
  }
</style>
