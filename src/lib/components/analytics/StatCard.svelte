<!-- src/lib/components/analytics/StatCard.svelte — 2026 -->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { icons, iconAliases } from '$lib/ui/icons';

  let {
    title,
    value,
    subtitle = null,
    trend = null,
    icon = null,
    variant = 'default'
  }: {
    title: string;
    value: string | number;
    subtitle?: string | null;
    trend?: { value: number; direction: 'up' | 'down' } | null;
    icon?: string | null;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  } = $props();

  // Treat the icon prop as a Lucide name when it matches the registry,
  // otherwise fall back to rendering it as text (legacy emoji callers).
  let isLucide = $derived(
    !!icon && (icon in icons || icon in iconAliases)
  );
</script>

<div class="stat-card stat-{variant}">
  {#if icon}
    <div class="stat-icon">
      {#if isLucide}
        <Icon name={icon as any} size="lg" />
      {:else}
        <span class="stat-icon__emoji" aria-hidden="true">{icon}</span>
      {/if}
    </div>
  {/if}

  <div class="stat-content">
    <div class="stat-header">
      <h3 class="stat-title">{title}</h3>
      {#if trend}
        <div class="stat-trend" data-direction={trend.direction}>
          <span class="trend-icon" aria-hidden="true">
            <Icon name={trend.direction === 'up' ? 'trending-up' : 'arrow-right'} size="xs" />
          </span>
          <span class="trend-value">{Math.abs(trend.value)}%</span>
        </div>
      {/if}
    </div>

    <div class="stat-value rf-num">{value}</div>

    {#if subtitle}
      <p class="stat-subtitle">{subtitle}</p>
    {/if}
  </div>
</div>

<style>
  .stat-card {
    position: relative;
    display: flex;
    gap: var(--space-md);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow-sm), var(--glass-border-highlight);
    overflow: hidden;
    isolation: isolate;
    transition:
      transform   var(--motion-md) var(--ease-spring-soft),
      box-shadow  var(--motion-md) var(--ease-standard),
      border-color var(--motion-md) var(--ease-standard);
    animation: rf-stagger-in var(--motion-lg) var(--ease-emphasized) both;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: 0.35;
    pointer-events: none;
    border-radius: inherit;
    background: radial-gradient(120% 100% at 0% 0%,
      color-mix(in oklab, var(--accent, var(--brand)) 14%, transparent),
      transparent 60%);
  }
  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--glass-shadow), var(--glass-border-highlight), var(--depth-glow-sm);
    border-color: color-mix(in oklab, var(--accent, var(--brand)) 25%, var(--glass-border));
  }

  .stat-default { --accent: var(--ink-2); }
  .stat-primary { --accent: var(--brand); }
  .stat-success { --accent: var(--ok); }
  .stat-warning { --accent: var(--warn); }
  .stat-danger  { --accent: var(--error); }

  .stat-icon {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, var(--accent, var(--brand)) 14%, transparent);
    color: var(--accent, var(--brand));
    border-radius: var(--radius-md);
    border: 1px solid color-mix(in oklab, var(--accent, var(--brand)) 22%, transparent);
    transition: transform var(--motion-md) var(--ease-spring-soft);
  }
  .stat-card:hover .stat-icon { transform: scale(1.06) rotate(-3deg); }

  .stat-icon__emoji { font-size: 1.6rem; line-height: 1; }

  .stat-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
  }

  .stat-title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-tertiary);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat-trend {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xxs);
    padding: var(--space-xxs) var(--space-sm);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .stat-trend[data-direction="up"] {
    color: var(--ok);
    background: color-mix(in oklab, var(--ok) 14%, transparent);
  }
  .stat-trend[data-direction="down"] {
    color: var(--error);
    background: color-mix(in oklab, var(--error) 14%, transparent);
  }
  .stat-trend[data-direction="down"] .trend-icon { transform: rotate(45deg); }

  .stat-value {
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--ink-primary);
    line-height: 1;
    letter-spacing: var(--tracking-tighter);
  }

  .stat-subtitle {
    font-size: var(--text-sm);
    color: var(--ink-tertiary);
    margin: 0;
  }

  @media (max-width: 640px) {
    .stat-value { font-size: var(--text-2xl); }
    .stat-icon { width: 44px; height: 44px; }
  }
</style>
