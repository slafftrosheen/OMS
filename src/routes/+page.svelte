<!-- src/routes/+page.svelte — Reclame Fabriek OMS Dashboard (2026) -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { currentUser } from '$lib/auth/authState.svelte';
  import StatCard from '$lib/components/analytics/StatCard.svelte';
  import LineChart from '$lib/components/analytics/LineChart.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { tokenColor } from '$lib/utils/tokenColor';
  import { t, locale } from 'svelte-i18n';
  import { loadDashboard } from '$lib/dashboard/data';
  import OrderBadges from '$lib/badges/OrderBadges.svelte';
  import { buildOrderBadges } from '$lib/badges/catalog';
  import { currentDay } from '$lib/badges/current-day';
  import { getAssistantContext } from '$lib/assistant/context';
  import { dashboardScreenContext } from '$lib/assistant/visible-context';

  const assistant = getAssistantContext();

  let recentOrders: any[] = $state([]);
  let verifiedTotal: number | null = $state(null);
  let liveKpis: { total: number; active: number; today: number; completedToday: number } | null = $state(null);
  let ordersError = $state(false);
  let chartData = $state<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });
  let loading = $state(true);

  let dashboardRequest: AbortController | null = null;

  async function loadDashboardData() {
    loading = true;
    ordersError = false;
    liveKpis = null;
    verifiedTotal = null;
    recentOrders = [];
    chartData = { labels: [], datasets: [] };
    dashboardRequest?.abort();
    const controller = new AbortController();
    dashboardRequest = controller;
    const result = await loadDashboard({ basePath: base, signal: controller.signal });
    if (controller.signal.aborted) return;
    recentOrders = result.orders;
    verifiedTotal = result.verifiedTotal;
    liveKpis = result.kpis;
    ordersError = result.ordersError;
    if (result.trends) {
      chartData = {
        labels: result.trends.dates,
        datasets: [{
          label: $t('dashboard.orders_label', { default: 'Order volume' }),
          data: result.trends.total,
          borderColor: tokenColor('--brand', '#ff2d55'),
          backgroundColor: tokenColor('--brand', '#ff2d55', 0.16)
        }]
      };
    }
    loading = false;
  }

  function formatDue(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat($locale || 'en', {
      day: 'numeric', month: 'short', year: 'numeric'
    }).format(date);
  }

  // Quick actions — Lucide icons replace the prior emojis
  const quickActions = [
    { href: '/orders/new',      icon: 'file-plus',   key: 'new_order',  fallbackTitle: 'New Order',       fallbackDesc: 'Create a new production order' },
    { href: '/production',      icon: 'factory',     key: 'production', fallbackTitle: 'Production Board',fallbackDesc: 'View production workflow' },
    { href: '/admin/materials', icon: 'boxes',       key: 'materials',  fallbackTitle: 'Materials',       fallbackDesc: 'Manage inventory' },
    { href: '/analytics',       icon: 'bar-chart-3', key: 'analytics',  fallbackTitle: 'Analytics',       fallbackDesc: 'View reports' },
    { href: '/calendar',        icon: 'calendar',    key: 'calendar',   fallbackTitle: 'Calendar',        fallbackDesc: 'Plan loading days' },
    { href: '/toolkit',         icon: 'layout-grid', key: 'ai_lab',     fallbackTitle: 'Toolkit',         fallbackDesc: 'Explore ideas and plan projects' }
  ] as const;

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 5)  return $t('dashboard.greeting_late',    { default: 'Working late' });
    if (h < 12) return $t('dashboard.greeting_morning', { default: 'Good morning' });
    if (h < 18) return $t('dashboard.greeting_afternoon', { default: 'Good afternoon' });
    return $t('dashboard.greeting_evening', { default: 'Good evening' });
  });

  onMount(() => {
    void loadDashboardData();
    return assistant.register({
      id: 'dashboard', title: () => $t('dashboard.title', { default: 'Dashboard' }), tools: () => [],
      context: () => dashboardScreenContext({
        loading, ordersError, verifiedTotal, kpis: liveKpis,
        recentOrders: recentOrders.map(order => ({
          id: order.id, reference: order.po_number, title: order.title, client: order.client,
          dueDate: order.due_date,
          badges: buildOrderBadges(order, $currentDay).map(badge => $t(badge.labelKey, badge.values ?? {}))
        })),
        trends: chartData.datasets.length ? { dates: chartData.labels, total: chartData.datasets[0].data } : null
      })
    });
  });
  onDestroy(() => dashboardRequest?.abort());
</script>

<svelte:head>
  <title>{$t('dashboard.title', { default: 'Dashboard' })} — OMS</title>
</svelte:head>

<!-- Hero / greeting -->
<header class="dash-hero rf-aurora">
  <div class="dash-hero__copy">
    <span class="dash-kicker"><span class="dash-kicker__led" aria-hidden="true"></span>{greeting}</span>
    <h1 class="dash-hero__title">
      {$currentUser?.username || 'Operator'}
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
  <!-- Numbers below are backed by the aggregate view, never the first five orders. -->
  <section class="dash-stats rf-bento" aria-label={$t('dashboard.kpi_label', { default: 'Key indicators' })}>
    <StatCard title={$t('dashboard.stat_total', { default: 'Total orders' })}
      value={liveKpis?.total ?? verifiedTotal ?? '—'} icon="clipboard-list" variant="default" />
    <StatCard title={$t('dashboard.stat_active', { default: 'Active orders' })}
      value={liveKpis?.active ?? '—'} icon="zap" variant="primary" />
    <StatCard title={$t('dashboard.stat_today', { default: 'Orders today' })}
      value={liveKpis?.today ?? '—'} icon="calendar" variant="warning" />
    <StatCard title={$t('dashboard.stat_completed_today', { default: 'Completed today' })}
      value={liveKpis?.completedToday ?? '—'} icon="check-circle" variant="success" />
  </section>
  {#if !liveKpis && !ordersError}
    <p class="dash-metrics-note">{$t('dashboard.metrics_unavailable', { default: 'Live KPI breakdown unavailable; only the verified order total is shown.' })}</p>
  {/if}

  <!-- Trend chart -->
  {#if chartData.datasets.length > 0}
    <section class="dash-chart">
      <div class="rf-section-head">
        <div>
          <span class="rf-section-eyebrow">{$t('dashboard.orders_label', { default: 'Order volume' })}</span>
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
        <span class="rf-section-eyebrow">{$t('dashboard.orders_kicker', { default: 'Priority first' })}</span>
        <h2>{$t('dashboard.orders_snapshot', { default: 'Orders snapshot' })}</h2>
      </div>
      <a href="{base}/orders" class="dash-link">
        <span>{$t('dashboard.view_all', { default: 'View all' })}</span>
        <Icon name="arrow-right" size="sm" />
      </a>
    </div>

    {#if ordersError}
      <div class="dash-empty card" role="alert">
        <Icon name="alert-triangle" size="xl" />
        <p>{$t('dashboard.order_load_error', { default: 'Unable to load orders right now.' })}</p>
        <button class="rf-btn" onclick={loadDashboardData}>{$t('common.retry', { default: 'Retry' })}</button>
      </div>
    {:else if recentOrders.length === 0}
      <div class="dash-empty card">
        <Icon name="inbox" size="xl" />
        <p>{$t('dashboard.no_orders', { default: 'No orders available' })}</p>
        <button class="rf-btn" onclick={() => goto(`${base}/orders/new`)}>
          {$t('dashboard.create_first', { default: 'Create the first order' })}
        </button>
      </div>
    {:else}
      <div class="dash-orders" aria-label={$t('dashboard.orders_snapshot', { default: 'Orders snapshot' })}>
        {#each recentOrders as order (order.id)}
          <a class="dash-order" href={`${base}/orders/${order.id}`}>
            <span class="dash-order__identity">
              <strong>{order.title || order.po_number || '—'}</strong>
              <small>{order.po_number || '—'} · {order.client || '—'}</small>
            </span>
            <span class="dash-order__meta">
              <OrderBadges {order} />
              <small>{$t('orders.due_date', { default: 'Due' })}: {formatDue(order.due_date)}</small>
            </span>
            <Icon name="arrow-right" size="sm" />
          </a>
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
        {#if action.key !== 'materials' || ['RD', 'Boss', 'HeadOfProduction'].includes($currentUser?.role ?? '')}
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
        {/if}
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

  /* LUMIGRID Lander: graphite operator hero, compact hierarchy, one vivid action. */
  .dash-hero {
    background:
      radial-gradient(ellipse 70% 100% at 0% 0%, color-mix(in oklab, var(--brand) 11%, transparent), transparent 65%),
      var(--glass-bg-strong);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow-sm), var(--glass-border-highlight);
    padding: clamp(var(--space-xl), 3vw, var(--space-2xl));
  }
  .dash-hero::after {
    content: '';
    position: absolute;
    width: min(260px, 60%); height: 2px;
    left: 0; top: 0;
    background: linear-gradient(90deg, var(--brand), var(--brand-2), var(--led-amber), transparent);
    pointer-events: none;
  }
  .dash-kicker { display: inline-flex; align-items: center; gap: var(--space-sm);
    font-size: var(--text-sm); color: var(--ink-secondary); font-weight: 600; }
  .dash-kicker__led { width: 7px; height: 7px; border-radius: 50%;
    background: var(--brand); box-shadow: 0 0 12px color-mix(in oklab, var(--brand) 45%, transparent); }
  .dash-hero__title { font-size: clamp(1.8rem, 3vw, 2.8rem); color: var(--ink-primary); }
  .dash-hero__sub { color: var(--ink-secondary); }
  .dash-hero__cta { justify-content: flex-end; }
  .rf-btn--lg { border-radius: var(--radius-md); }
  .dash-metrics-note { color: var(--ink-tertiary); font-size: var(--text-xs);
    margin: calc(-1 * var(--space-xl)) 0 var(--space-xl); }
  .dash-action { background: var(--glass-bg-strong); box-shadow: var(--glass-shadow-sm); }
  .dash-action:hover { transform: translateY(-2px); }
  .dash-action__chev { opacity: .65; transform: none; }
  .dash-action__icon { border: 1px solid color-mix(in oklab, var(--brand) 22%, transparent); }
  @media (max-width: 768px) { .dash-hero__cta { justify-content: stretch; } }

  /* Operator-facing order list: real data, no invented progress stages. */
  .dash-orders { display:grid; gap:var(--space-xxs); padding:var(--space-sm);
    border:1px solid var(--glass-border); border-radius:var(--radius-lg);
    background:var(--glass-bg); box-shadow:var(--glass-shadow-sm); }
  .dash-order { display:grid; grid-template-columns:minmax(0,1fr) minmax(150px,auto) auto;
    gap:var(--space-xl); align-items:center; padding:var(--space-md) var(--space-lg);
    border-radius:var(--radius-md); text-decoration:none; color:var(--ink-primary);
    min-width:0; transition:background var(--motion-sm) var(--ease-standard); }
  .dash-order + .dash-order { border-top:1px solid var(--divider); }
  .dash-order:hover { background:var(--brand-soft); }
  .dash-order__identity,.dash-order__meta { display:grid; min-width:0; gap:var(--space-xxs); }
  .dash-order__identity strong { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .dash-order small { color:var(--ink-tertiary); font-size:var(--text-xs); }
  .dash-order__meta { justify-items:end; text-align:right; }

  .dash-order :global(svg) { color:var(--ink-tertiary); }
  .dash-order:hover :global(svg) { color:var(--brand); }
  @media (max-width:640px) {
    .dash-order { grid-template-columns:minmax(0,1fr) auto; gap:var(--space-xs); }
    .dash-order__meta { grid-column:1; grid-row:2; justify-items:start; text-align:left; }
    .dash-order :global(svg) { grid-column:2; grid-row:1 / span 2; }
  }
</style>
