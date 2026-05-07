<script lang="ts">
  type Step = { name: string; done?: boolean; active?: boolean; error?: boolean };

  let {
    steps = [],
    orientation = 'horizontal'
  }: {
    steps?: Step[];
    orientation?: 'horizontal' | 'vertical';
  } = $props();
</script>

<div class="rf-stepper" data-orientation={orientation} role="list">
  {#each steps as s, i}
    {@const isDone = s.done ?? false}
    {@const isActive = s.active ?? false}
    {@const isError = s.error ?? false}
    <div
      class="rf-stepper__step"
      data-done={isDone || null}
      data-active={isActive || null}
      data-error={isError || null}
      role="listitem"
      aria-current={isActive ? 'step' : undefined}
    >
      <div class="rf-stepper__node">
        <div class="rf-stepper__dot">
          {#if isError}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 1L9 9H1z" transform="rotate(180 5 5)"/></svg>
          {:else if isDone}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5l2 2.5 4-4"/></svg>
          {:else}
            <span aria-hidden="true">{i + 1}</span>
          {/if}
        </div>
        {#if i < steps.length - 1}
          <div class="rf-stepper__connector" aria-hidden="true"></div>
        {/if}
      </div>
      <div class="rf-stepper__label">{s.name}</div>
    </div>
  {/each}
</div>

<style>
  .rf-stepper {
    display: flex;
    gap: 0;
  }
  .rf-stepper[data-orientation="vertical"] {
    flex-direction: column;
  }

  .rf-stepper__step {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
  }
  .rf-stepper[data-orientation="vertical"] .rf-stepper__step {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    flex: none;
  }

  .rf-stepper__node {
    display: flex;
    align-items: center;
    flex: 1;
  }
  .rf-stepper[data-orientation="vertical"] .rf-stepper__node {
    flex-direction: column;
    align-items: center;
    flex: none;
    width: 28px;
  }

  .rf-stepper__dot {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    border: 2px solid var(--border);
    background: var(--bg-1);
    color: var(--ink-tertiary);
    font-size: var(--text-xs);
    font-weight: 700;
    flex-shrink: 0;
    transition:
      background    var(--motion-sm) var(--ease-standard),
      border-color  var(--motion-sm) var(--ease-standard),
      color         var(--motion-sm) var(--ease-standard),
      box-shadow    var(--motion-sm) var(--ease-standard);
  }
  .rf-stepper__step[data-completed] .rf-stepper__dot {
    background: var(--brand);
    border-color: var(--brand);
    color: white;
    box-shadow: 0 0 0 3px var(--brand-soft);
  }
  .rf-stepper__step[data-active] .rf-stepper__dot {
    border-color: var(--brand);
    color: var(--brand);
    background: var(--brand-soft);
    box-shadow: 0 0 0 3px var(--brand-soft);
  }
  .rf-stepper__step[data-error] .rf-stepper__dot {
    background: var(--error);
    border-color: var(--error);
    color: white;
    box-shadow: 0 0 0 3px var(--error-soft);
  }

  .rf-stepper__connector {
    flex: 1;
    height: 2px;
    background: var(--divider);
    margin: 0 var(--space-xs);
    border-radius: var(--radius-full);
    min-width: var(--space-lg);
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .rf-stepper__step[data-done] .rf-stepper__connector {
    background: var(--brand);
  }
  .rf-stepper[data-orientation="vertical"] .rf-stepper__connector {
    width: 2px;
    height: var(--space-xl);
    flex: none;
    margin: var(--space-xs) 0;
  }

  .rf-stepper__label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
    padding-right: var(--space-sm);
    transition: color var(--motion-sm) var(--ease-standard);
  }
  .rf-stepper[data-orientation="vertical"] .rf-stepper__label {
    padding-left: var(--space-sm);
    padding-right: 0;
  }
  .rf-stepper__step[data-active] .rf-stepper__label,
  .rf-stepper__step[data-done] .rf-stepper__label {
    color: var(--ink-primary);
  }
  .rf-stepper__step[data-error] .rf-stepper__label {
    color: var(--error);
  }
</style>
