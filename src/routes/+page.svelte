<!-- src/routes/+page.svelte — Reclame Fabriek OMS Dashboard (2026) -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { ordersStore as orders, orderStats } from '$lib/stores/orders';
  import StatCard from '$lib/components/analytics/StatCard.svelte';
  import OrderCard from '$lib/components/orders/OrderCard.svelte';
  import LineChart from '$lib/components/analytics/LineChart.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { tokenColor } from '$lib/utils/tokenColor';
  import { t } from 'svelte-i18n';

  let recentOrders: any[] = $state([]);
  let chartData = $state<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });
  let loading = $state(true);

  async function loadDashboardData() {
    loading = true;
    try {
      const response = await fetch('/api/orders?limit=5&sort=created_at&direction=desc');
      const result = await response.json();

      let ordersData: any[] = [];
      if (Array.isArray(result.data)) ordersData = result.data;
      else if (Array.isArray(result.orders)) ordersData = result.orders;
      else if (Array.isArray(result)) ordersData = result;

      orders.setOrders(ordersData ?? []);
      recentOrders = (ordersData ?? []).slice(0, 5);

      try {
        const analyticsResponse = await fetch('/api/analytics/dashboard?preset=month');
        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          if (analyticsData?.success && analyticsData?.data?.revenue?.revenueByMonth) {
            const revenue = analyticsData.data.revenue;
            chartData = {
              labels: revenue.revenueByMonth.map((d: any) => d.month),
              datasets: [{
                label: 'Revenue',
                data: revenue.revenueByMonth.map((d: any) => d.revenue),
                borderColor:     tokenColor('--brand', '#7e9bff'),
                backgroundColor: tokenColor('--brand', '#7e9bff', 0.16)
              }]
            };
          }
        }
      } catch (analyticsError) {
        console.log('Analytics data not available:', analyticsError);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      orders.setError('Failed to load orders');
    } finally {
      loading = false;
    }
  }

  function handleOrderClick(order: any) {
    goto(`${base}/orders/${order.id}`);
  }

  // Quick actions — Lucide icons replace the prior emojis
  const quickActions = [
    { href: '/orders/new',      icon: 'file-plus',   key: 'new_order',  fallbackTitle: 'New Order',       fallbackDesc: 'Create a new production order' },
    { href: '/production',      icon: 'factory',     key: 'production', fallbackTitle: 'Production Board',fallbackDesc: 'View production workflow' },
    { href: '/admin/materials', icon: 'boxes',       key: 'materials',  fallbackTitle: 'Materials',       fallbackDesc: 'Manage inventory' },
    { href: '/analytics',       icon: 'bar-chart-3', key: 'analytics',  fallbackTitle: 'Analytics',       fallbackDesc: 'View reports' },
    { href: '/calendar',        icon: 'calendar',    key: 'calendar',   fallbackTitle: 'Calendar',        fallbackDesc: 'Plan loading days' },
    { href: '/ai-lab',          icon: 'sparkles',    key: 'ai_lab',     fallbackTitle: 'AI Lab',          fallbackDesc: 'Run reasoning, search, RAG' }
  ] as const;

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 5)  return $t('dashboard.greeting_late',    { default: 'Working late' });
    if (h < 12) return $t('dashboard.greeting_morning', { default: 'Good morning' });
    if (h < 18) return $t('dashboard.greeting_afternoon', { default: 'Good afternoon' });
    return $t('dashboard.greeting_evening', { default: 'Good evening' });
  });

  onMount(() => { loadDashboardData(); });
</script>

<svelte:head>
  <title>{$t('dashboard.title', { default: 'Dashboard' })} — OMS</title>
</svelte:head>

<!-- Hero / greeting -->
<header class="dash-hero rf-aurora">
  <div class="dash-hero__copy">
    <span class="rf-section-eyebrow">{greeting}</span>
    <h1 class="dash-hero__title">
      <span class="rf-text-gradient">{$currentUser?.username || 'Operator'}</span>
    </h1>
    <p class="dash-hero__sub">
      {$t('dashboard.welcome', { default: "Here's what's moving through the floor today." })}
    </p>
  </div>
  <div class="dash-hero__cta">
    <button class="rf-btn rf-btn--lg" onclick={() => goto(`${base}/orders/new`)}>
      <Icon name="plus" size="sm" />
      <span>{$t('dashboard.new_order', { default: 'New Order' })}</span>
    </button>
    <a class="dash-hero__link" href="{base}/orders">
      <Icon name="clipboard-list" size="sm" />
      <span>{$t('dashboard.view_all_orders', { default: 'View all orders' })}</span>
      <Icon name="arrow-right" size="sm" />
    </a>
  </div>
</header>

{#if loading}
  <div class="dash-loading">
    <div class="rf-spinner" aria-hidden="true"></div>
    <p>{$t('dashboard.loading', { default: 'Loading dashboard…' })}</p>
  </div>
{:else}
  <!-- Stat cards (bento grid) -->
  <section class="dash-stats rf-bento" aria-label={$t('dashboard.kpi_label', { default: 'Key indicators' })}>
    <StatCard
      title={$t('dashboard.stat_total', { default: 'Total Orders' })}
      value={$orderStats.total}
      icon="clipboard-list"
      variant="default"
    />
    <StatCard
      title={$t('dashboard.stat_active', { default: 'Active' })}
      value={$orderStats.active}
      icon="zap"
      variant="primary"
      trend={{ value: 12, direction: 'up' }}
    />
    <StatCard
      title={$t('dashboard.stat_completed', { default: 'Completed' })}
      value={$orderStats.completed}
      icon="check-circle"
      variant="success"
    />
    <StatCard
      title={$t('dashboard.stat_overdue', { default: 'Overdue' })}
      value={$orderStats.overdue}
      icon="alert-triangle"
      variant="danger"
      trend={{ value: 5, direction: 'down' }}
    />
  </section>

  <!-- Trend chart -->
  {#if chartData.datasets.length > 0}
    <section class="dash-chart">
      <div class="rf-section-head">
        <div>
          <span class="rf-section-eyebrow">{$t('dashboard.revenue_label', { default: 'Revenue' })}</span>
          <h2>{$t('dashboard.chart_overview', { default: 'Orders Overview' })}</h2>
        </div>
        <a href="{base}/analytics" class="dash-link">
          <span>{$t('dashboard.view_analytics', { default: 'Analytics' })}</span>
          <Icon name="arrow-right" size="sm" />
        </a>
      </div>
      <Card padding="lg">
        <LineChart data={chartData} title={$t('dashboard.chart_period', { default: 'Last 30 Days' })} height={300} />
      </Card>
    </section>
  {/if}

  <!-- Recent orders -->
  <section class="dash-recent">
    <div class="rf-section-head">
      <div>
        <span class="rf-section-eyebrow">{$t('dashboard.recent_label', { default: 'In progress' })}</span>
        <h2>{$t('dashboard.kpi.active', { default: 'Active Orders' })}</h2>
      </div>
      <a href="{base}/orders" class="dash-link">
        <span>{$t('dashboard.view_all', { default: 'View all' })}</span>
        <Icon name="arrow-right" size="sm" />
      </a>
    </div>

    {#if recentOrders.length === 0}
      <div class="dash-empty card">
        <Icon name="inbox" size="xl" />
        <p>{$t('dashboard.no_orders', { default: 'No active orders right now' })}</p>
        <button class="rf-btn" onclick={() => goto(`${base}/orders/new`)}>
          {$t('dashboard.create_first', { default: 'Create the first order' })}
        </button>
      </div>
    {:else}
      <div class="dash-orders rf-bento rf-bento--lg rf-stagger">
        {#each recentOrders as order, i (order.id)}
          <div style="--i: {i}">
            <OrderCard {order} onclick={handleOrderClick} showActions={false} />
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Quick actions -->
  <section class="dash-actions">
    <div class="rf-section-head">
      <div>
        <span class="rf-section-eyebrow">{$t('dashboard.shortcuts_label', { default: 'Shortcuts' })}</span>
        <h2>{$t('dashboard.quick_actions', { default: 'Quick Actions' })}</h2>
      </div>
    </div>

    <div class="dash-actions-grid rf-stagger">
      {#each quickActions as action, i (action.href)}
        <button
          class="dash-action card"
          onclick={() => goto(`${base}${action.href}`)}
          style="--i: {i}"
        >
          <span class="dash-action__icon">
            <Icon name={action.icon} size="lg" />
          </span>
          <span class="dash-action__title">
            {$t(`dashboard.actions.${action.key}.title`, { default: action.fallbackTitle })}
          </span>
          <span class="dash-action__desc">
            {$t(`dashboard.actions.${action.key}.desc`, { default: action.fallbackDesc })}
          </span>
          <span class="dash-action__chev" aria-hidden="true">
            <Icon name="arrow-right" size="sm" />
          </span>
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  /* ---------- Hero ---------- */
  .dash-hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xl);
    padding: var(--space-2xl) var(--space-xl);
    margin-bottom: var(--space-xl);
    border-radius: var(--radius-lg);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow), var(--glass-border-highlight);
    position: relative;
    overflow: hidden;
  }

  .dash-hero__copy { min-width: 0; }
  .dash-hero__title {
    margin: 0;
    font-size: var(--text-display);
    font-weight: 700;
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tighter);
  }
  .dash-hero__sub {
    margin: var(--space-sm) 0 0;
    color: var(--ink-tertiary);
    font-size: var(--text-md);
    max-width: 60ch;
  }

  .dash-hero__cta {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }
  .dash-hero__link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--ink-secondary);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-full);
    transition:
      color      var(--motion-sm) var(--ease-standard),
      background var(--motion-sm) var(--ease-standard),
      transform  var(--motion-xs) var(--ease-spring-soft);
  }
  .dash-hero__link:hover {
    color: var(--brand);
    background: var(--brand-soft);
    transform: translateX(2px);
  }

  .rf-btn--lg {
    padding: var(--space-md) var(--space-xl);
    font-size: var(--text-md);
    border-radius: var(--radius-full);
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
  }

  /* ---------- Loading ---------- */
  .dash-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-4xl) var(--space-xl);
    color: var(--ink-tertiary);
  }

  /* ---------- Sections ---------- */
  .dash-stats { margin-bottom: var(--space-2xl); }
  .dash-chart, .dash-recent, .dash-actions { margin-bottom: var(--space-2xl); }

  .dash-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--ink-secondary);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-full);
    transition:
      color      var(--motion-sm) var(--ease-standard),
      background var(--motion-sm) var(--ease-standard),
      transform  var(--motion-xs) var(--ease-spring-soft);
  }
  .dash-link:hover {
    color: var(--brand);
    background: var(--brand-soft);
    transform: translateX(2px);
  }

  /* ---------- Empty ---------- */
  .dash-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-4xl) var(--space-xl);
    color: var(--ink-tertiary);
    text-align: center;
  }
  .dash-empty :global(svg) { opacity: 0.4; }

  /* ---------- Quick actions ---------- */
  .dash-actions-grid {
    display: grid;
    gap: var(--space-md);
    grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  }

  .dash-action {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto;
    grid-template-areas:
      "icon title chev"
      "icon desc  chev";
    align-items: center;
    gap: var(--space-xxs) var(--space-md);
    padding: var(--space-lg);
    text-align: left;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    color: var(--text);
    transition:
      transform   var(--motion-md) var(--ease-spring-soft),
      box-shadow  var(--motion-md) var(--ease-standard),
      border-color var(--motion-md) var(--ease-standard);
    box-shadow: var(--glass-shadow-sm);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    /* Override the default rf-btn cascade — rf-btn primary background not desired here */
    font-family: inherit;
    overflow: hidden;
    position: relative;
    isolation: isolate;
  }
  .dash-action::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--spotlight);
    opacity: 0;
    transition: opacity var(--motion-md) var(--ease-standard);
    border-radius: inherit;
    pointer-events: none;
  }
  .dash-action:hover {
    transform: translateY(-3px);
    border-color: color-mix(in oklab, var(--brand) 30%, var(--glass-border));
    box-shadow: var(--glass-shadow-lg), var(--depth-glow-md);
  }
  .dash-action:hover::before { opacity: 1; }
  .dash-action:active { transform: translateY(-1px) scale(0.99); }

  .dash-action__icon {
    grid-area: icon;
    width: 44px; height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
    transition: transform var(--motion-md) var(--ease-spring-soft);
  }
  .dash-action:hover .dash-action__icon {
    transform: scale(1.08) rotate(-3deg);
    background: color-mix(in oklab, var(--brand) 22%, transparent);
  }

  .dash-action__title {
    grid-area: title;
    font-size: var(--text-md);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    color: var(--ink-primary);
  }

  .dash-action__desc {
    grid-area: desc;
    font-size: var(--text-sm);
    color: var(--ink-tertiary);
    line-height: var(--leading-snug);
  }

  .dash-action__chev {
    grid-area: chev;
    color: var(--ink-quaternary);
    opacity: 0;
    transform: translateX(-6px);
    transition:
      opacity   var(--motion-sm) var(--ease-standard),
      transform var(--motion-sm) var(--ease-spring-soft),
      color     var(--motion-sm) var(--ease-standard);
  }
  .dash-action:hover .dash-action__chev {
    opacity: 1;
    transform: translateX(0);
    color: var(--brand);
  }

  /* ---------- Mobile ---------- */
  @media (max-width: 768px) {
    .dash-hero {
      padding: var(--space-xl) var(--space-md);
      flex-direction: column;
      align-items: stretch;
    }
    .dash-hero__cta { justify-content: stretch; }
    .rf-btn--lg { flex: 1; justify-content: center; }
  }
</style>
