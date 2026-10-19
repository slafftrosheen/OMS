<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import { ALL_STATIONS } from '$lib/order/workflow';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';

  let user = $derived($currentUser);

  interface BoardStats {
    queued: number;
    in_progress: number;
    blocked: number;
    rework: number;
  }
  let stats = $state<BoardStats | null>(null);
  let statsLoading = $state(true);
  let statsError = $state(false);

  async function loadStats() {
    statsLoading = true;
    try {
      const res = await fetch(`${base}/api/production/board`);
      if (!res.ok)throw new Error('Production board unavailable');
      const data=await res.json();
      if (!data?.success || !data?.totals)throw new Error('Production totals unavailable');
      stats={queued:data.totals.queued,in_progress:data.totals.inProgress,
        blocked:data.totals.blocked,rework:data.totals.rework};
      statsError=false;
    } catch {
      statsError=true;
      // Retain last-good counts; do not invent zeros after an outage.
    } finally {
      statsLoading = false;
    }
  }

  onMount(loadStats);

  let userRole = $derived((user as any)?.roles?.Production ?? (user as any)?.role ?? '');
  let userStations = $derived.by(()=>{
    const aliases:Record<string,string> = {
      PAINTING:'PAINT', PACKING:'PACKAGING', FILM_COVERING:'FILM_COATING'
    };
    const ids:unknown[]=(user as any)?.stations??[];
    const codes=ids.flatMap((entry:unknown)=>{
      const key=typeof entry==='string'?entry:
        entry&&typeof entry==='object'&&'stationId' in entry
          ? String((entry as {stationId:unknown}).stationId) : '';
      const station=aliases[key.toUpperCase()]??key.toUpperCase();
      return ALL_STATIONS.includes(station)?[station]:[];
    });
    return [...new Set(codes)];
  });
  let userName = $derived((user as any)?.displayName ?? (user as any)?.username ?? '');
</script>

<svelte:head>
  <title>{$t('production_dash.title', { default: 'Production' })} - OMS</title>
</svelte:head>

<div class="dashboard-container">
  <header class="dashboard-header">
    <div class="header-left">
      <h1>{$t('production_dash.title', { default: 'Production Dashboard' })}</h1>
      {#if userName}
        <p class="subtitle">
          {userName}
          {#if userRole}<span class="role-badge">{userRole}</span>{/if}
        </p>
      {/if}
    </div>
    <a href="{base}/production" class="btn-outline-sm">
      <Icon name="layout-grid" size="sm" />
      {$t('production_dash.full_board', { default: 'Full Board' })}
    </a>
  </header>

  {#if statsError}
    <div class="stats-error" role="alert">
      {$t('productionPlanning.lastGood')}
      <button onclick={loadStats} disabled={statsLoading}>{$t('productionPlanning.retry')}</button>
    </div>
  {/if}
  <!-- Live stats row -->
  <div class="stats-row">
    {#if statsLoading}
      {#each [0,1,2,3] as _}
        <div class="stat-card stat-card--loading"></div>
      {/each}
    {:else}
      <div class="stat-card">
        <span class="stat-value">{stats?.in_progress ?? '—'}</span>
        <span class="stat-label">{$t('stationView.in_progress', { default: 'In Progress' })}</span>
      </div>
      <div class="stat-card stat-card--warn">
        <span class="stat-value">{stats?.queued ?? '—'}</span>
        <span class="stat-label">{$t('stationView.queued', { default: 'Queued' })}</span>
      </div>
      <div class="stat-card stat-card--danger">
        <span class="stat-value">{stats?.blocked ?? '—'}</span>
        <span class="stat-label">{$t('stationView.blocked', { default: 'Blocked' })}</span>
      </div>
      <div class="stat-card stat-card--warn">
        <span class="stat-value">{stats?.rework ?? '—'}</span>
        <span class="stat-label">{$t('stationView.rework', { default: 'Rework' })}</span>
      </div>
    {/if}
  </div>

  <div class="dashboard-grid">
    <!-- Quick Actions -->
    <div class="card">
      <h2>{$t('production_dash.quick_actions', { default: 'Quick Actions' })}</h2>
      <div class="actions">
        {#if user && can(user, 'viewOrders')}
          <a href="{base}/orders" class="action-btn">
            <Icon name="clipboard-list" size="sm" />
            {$t('production_dash.view_orders', { default: 'View Orders' })}
          </a>
        {/if}
        {#if user && can(user, 'viewOrders')}
          <a href="{base}/production" class="action-btn">
            <Icon name="kanban" size="sm" />
            {$t('production_dash.production_board', { default: 'Production Board' })}
          </a>
        {/if}
        <a href="{base}/production/exceptions" class="action-btn">
          <Icon name="alert-triangle" size="sm" />
          {$t('productionExceptions.open')}
        </a>
        <a href="{base}/production/performance" class="action-btn">
          <Icon name="bar-chart-3" size="sm" />
          {$t('productionPerformance.open')}
        </a>
        <a href="{base}/production/planner" class="action-btn">
          <Icon name="calendar-days" size="sm" />
          {$t('capacityPlanner.open')}
        </a>
        <a href="{base}/calendar" class="action-btn">
          <Icon name="calendar" size="sm" />
          {$t('nav.calendar', { default: 'Calendar' })}
        </a>
        <a href="{base}/inventory" class="action-btn">
          <Icon name="package" size="sm" />
          {$t('nav.inventory', { default: 'Inventory' })}
        </a>
      </div>
    </div>

    <!-- Assigned Stations -->
    <div class="card">
      <h2>{$t('production_dash.station_info', { default: 'My Stations' })}</h2>
      {#if userStations.length > 0}
        <p class="card-desc">{$t('production_dash.assigned_stations', { default: 'Stations assigned to you:' })}</p>
        <div class="station-list">
          {#each userStations as station}
            <a href="{base}/station/{station.toLowerCase()}" class="station-badge">
              <Icon name="cpu" size="sm" />
              {station}
            </a>
          {/each}
        </div>
      {:else}
        <p class="card-desc muted">{$t('production_dash.no_stations', { default: 'No stations assigned. Contact an admin.' })}</p>
        <a href="{base}/production" class="action-btn">
          <Icon name="layout-grid" size="sm" />
          {$t('production_dash.view_all_stations', { default: 'View All Stations' })}
        </a>
      {/if}
    </div>

    <!-- Analytics link -->
    <div class="card">
      <h2>{$t('production_dash.analytics', { default: 'Analytics' })}</h2>
      <p class="card-desc">{$t('production_dash.analytics_desc', { default: 'View throughput, rework rates and station performance.' })}</p>
      <div class="actions">
        <a href="{base}/analytics" class="action-btn">
          <Icon name="bar-chart-2" size="sm" />
          {$t('production_dash.open_analytics', { default: 'Open Analytics' })}
        </a>
      </div>
    </div>
  </div>
</div>

<style>
.dashboard-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-xl, 24px);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl, 24px);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.dashboard-header h1 {
  margin: 0 0 4px 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text);
}

.subtitle { margin: 0; font-size: var(--text-sm); color: var(--text-muted, var(--muted)); }

.role-badge {
  display: inline-block;
  padding: 2px 8px;
  background: var(--brand-soft, color-mix(in oklab, var(--brand) 12%, transparent));
  color: var(--brand);
  border-radius: var(--radius-full, 999px);
  font-size: 0.7rem;
  font-weight: 700;
  margin-left: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-outline-sm {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text);
  text-decoration: none;
  transition: background var(--transition-fast), border-color var(--transition-fast);
  flex-shrink: 0;
}
.btn-outline-sm:hover { background: var(--bg-2); border-color: var(--border-strong, var(--brand)); }

/* Stats */
.stats-error{padding:.7rem 1rem;border:1px solid var(--error);border-radius:8px;
 display:flex;gap:1rem;justify-content:space-between;align-items:center;flex-wrap:wrap}
.stats-error button{padding:.5rem .8rem;cursor:pointer}
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
}

.stat-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 80px;
  transition: border-color var(--transition-fast);
}
.stat-card--loading {
  background: var(--bg-2);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
.stat-card--warn  { border-color: var(--warn); }
.stat-card--danger { border-color: var(--error); }

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}
.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted, var(--muted));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}

/* Grid */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.card h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.card-desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted, var(--muted));
  line-height: 1.5;
}
.card-desc.muted { opacity: 0.7; }

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 14px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--radius-sm);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.action-btn:hover { background: var(--bg-0); border-color: var(--brand); color: var(--brand); }

.station-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.station-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.station-badge:hover { border-color: var(--brand); color: var(--brand); }

@media (max-width: 768px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .dashboard-header { flex-direction: column; }
}

  /* R04: graphite work overview, semantic production pressure, visible focus. */
  .dashboard-container{max-width:1320px;padding:var(--space-lg) 0 var(--space-2xl);gap:var(--space-lg)}
  .dashboard-header{position:relative;padding:var(--space-lg) 0;border-bottom:1px solid var(--divider)}
  .dashboard-header::before{content:'';position:absolute;top:0;left:0;width:85px;height:2px;background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent)}
  .dashboard-header h1{font-size:clamp(1.55rem,2.7vw,2.15rem);color:var(--ink-primary)}
  .role-badge{border-radius:var(--radius-sm);border:1px solid color-mix(in oklab,var(--brand) 30%,var(--border))}
  .btn-outline-sm{min-height:44px;border-radius:var(--radius-sm);color:var(--ink-primary)}
  .stats-row{grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-sm)}
  .stat-card{min-width:0;align-items:flex-start;text-align:start;border:1px solid var(--glass-border);background:var(--bg-1);border-radius:var(--radius-md);padding:var(--space-lg);gap:var(--space-sm);min-height:106px}
  .stat-value{font-size:clamp(1.35rem,2.3vw,1.9rem);font-variant-numeric:tabular-nums;color:var(--ink-primary)}
  .stat-label{text-transform:none;letter-spacing:.02em;text-align:start;line-height:1.35;color:var(--ink-secondary)}
  .stat-card--warn{border-color:color-mix(in oklab,var(--warn) 40%,var(--border))}
  .stat-card--danger{border-color:color-mix(in oklab,var(--error) 45%,var(--border))}
  .stat-card--danger .stat-value{color:var(--error)}
  .dashboard-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:var(--space-md)}
  .card{min-width:0;background:var(--glass-bg-strong);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:var(--space-xl)}
  .card h2{color:var(--ink-primary);font-size:var(--text-lg)}
  .action-btn,.station-badge{min-height:44px;background:var(--bg-1);border:1px solid var(--border);color:var(--ink-secondary);border-radius:var(--radius-sm);font-weight:650}
  .action-btn:hover,.station-badge:hover{background:var(--bg-2);color:var(--ink-primary);border-color:var(--border-strong)}
  .action-btn:focus-visible,.station-badge:focus-visible,.btn-outline-sm:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  @media(max-width:760px){.dashboard-container{padding:var(--space-sm) 0 var(--space-xl)}.stats-row{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:var(--space-lg)}}
  @media(prefers-reduced-motion:reduce){.stat-card--loading{animation:none}}
  @media(prefers-reduced-transparency:reduce){.card{background:var(--bg-1)}}
</style>
