<script lang="ts">
  import type { IconName } from './icons';
  import Icon from './Icon.svelte';

  let {
    title = '',
    value = '',
    icon,
    trend = null,
    trendValue = '',
    tone = 'brand'
  }: {
    title?: string;
    value?: string | number;
    icon?: IconName;
    trend?: 'up' | 'down' | 'neutral' | null;
    trendValue?: string;
    tone?: 'brand' | 'ok' | 'warn' | 'error' | 'neutral';
  } = $props();

  const toneMap = {
    brand:   { bg: 'var(--brand-soft)',  fg: 'var(--brand)' },
    ok:      { bg: 'var(--ok-soft)',     fg: 'var(--ok)' },
    warn:    { bg: 'var(--warn-soft)',   fg: 'var(--warn)' },
    error:   { bg: 'var(--error-soft)',  fg: 'var(--error)' },
    neutral: { bg: 'var(--bg-2)',        fg: 'var(--ink-secondary)' },
  } as const;

  const colors = $derived(toneMap[tone]);
</script>

<div class="rf-kpi">
  {#if icon}
    <div class="rf-kpi__icon" style="background:{colors.bg};color:{colors.fg}">
      <Icon name={icon} size="md" />
    </div>
  {/if}
  <div class="rf-kpi__body">
    <div class="rf-kpi__value" style="font-variant-numeric:tabular-nums">{value}</div>
    <div class="rf-kpi__title">{title}</div>
    {#if trend && trendValue}
      <div class="rf-kpi__trend" data-trend={trend}>
        {#if trend === 'up'}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 1l4 4H1z"/></svg>
        {:else if trend === 'down'}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 9L1 5h8z"/></svg>
        {/if}
        {trendValue}
      </div>
    {/if}
  </div>
</div>

<style>
  .rf-kpi {
    display: flex;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-lg);
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--elevation-1);
    transition:
      box-shadow   var(--motion-sm) var(--ease-standard),
      border-color var(--motion-sm) var(--ease-standard),
      transform    var(--motion-sm) var(--ease-standard);
  }
  .rf-kpi:hover {
    box-shadow: var(--elevation-2);
    transform: translateY(-1px);
  }

  .rf-kpi__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .rf-kpi__body { flex: 1; min-width: 0; }

  .rf-kpi__value {
    font-size: var(--text-2xl);
    font-weight: 800;
    line-height: 1.15;
    color: var(--ink-primary);
    letter-spacing: var(--tracking-tight);
  }

  .rf-kpi__title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-tertiary);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    margin-top: var(--space-xxs);
  }

  .rf-kpi__trend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--text-xs);
    font-weight: 600;
    margin-top: var(--space-xs);
  }
  .rf-kpi__trend[data-trend="up"]      { color: var(--ok); }
  .rf-kpi__trend[data-trend="down"]    { color: var(--error); }
  .rf-kpi__trend[data-trend="neutral"] { color: var(--ink-tertiary); }
</style>
