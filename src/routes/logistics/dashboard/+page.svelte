<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';

  let user = $derived($currentUser);

  interface LogisticsStats {
    pending_dispatch: number;
    scheduled_today: number;
    overdue: number;
    loading_capacity_pct: number;
  }
  let stats = $state<LogisticsStats | null>(null);
  let statsLoading = $state(true);

  async function loadStats() {
    statsLoading = true;
    try {
      const [calRes, loadRes] = await Promise.all([
        fetch(`${base}/api/calendar/capacity`),
        fetch(`${base}/api/loading-days/capacity`),
      ]);
      const cal  = calRes.ok  ? await calRes.json()  : {};
      const load = loadRes.ok ? await loadRes.json() : {};
      stats = {
        pending_dispatch:    cal.pending_dispatch    ?? 0,
        scheduled_today:     cal.scheduled_today     ?? 0,
        overdue:             cal.overdue             ?? 0,
        loading_capacity_pct: load.capacity_pct      ?? 0,
      };
    } catch {
      // Non-critical — dashboard still usable without live stats
    } finally {
      statsLoading = false;
    }
  }

  onMount(loadStats);

  let userRole = $derived((user as any)?.roles?.Logistics ?? (user as any)?.role ?? '');
  let userName = $derived((user as any)?.displayName ?? (user as any)?.username ?? '');
</script>

<svelte:head>
  <title>{$t('logistics_dash.title', { default: 'Logistics' })} - OMS</title>
</svelte:head>

<div class="dashboard-container">
  <header class="dashboard-header">
    <div class="header-left">
      <h1>{$t('logistics_dash.title', { default: 'Logistics Dashboard' })}</h1>
      {#if userName}
        <p class="subtitle">
          {userName}
          {#if userRole}<span class="role-badge">{userRole}</span>{/if}
        </p>
      {/if}
    </div>
    <a href="{base}/calendar" class="btn-outline-sm">
      <Icon name="calendar" size="sm" />
      {$t('logistics_dash.open_calendar', { default: 'Open Calendar' })}
    </a>
  </header>

  <!-- Live stats row -->
  <div class="stats-row">
    {#if statsLoading}
      {#each [0,1,2,3] as _}
        <div class="stat-card stat-card--loading"></div>
      {/each}
    {:else}
      <div class="stat-card">
        <span class="stat-value">{stats?.scheduled_today ?? '—'}</span>
        <span class="stat-label">{$t('logistics_dash.scheduled_today', { default: 'Scheduled Today' })}</span>
      </div>
      <div class="stat-card stat-card--warn">
        <span class="stat-value">{stats?.pending_dispatch ?? '—'}</span>
        <span class="stat-label">{$t('logistics_dash.pending_dispatch', { default: 'Pending Dispatch' })}</span>
      </div>
      <div class="stat-card stat-card--danger">
        <span class="stat-value">{stats?.overdue ?? '—'}</span>
        <span class="stat-label">{$t('logistics_dash.overdue', { default: 'Overdue' })}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{stats?.loading_capacity_pct ?? '—'}{stats != null ? '%' : ''}</span>
        <span class="stat-label">{$t('logistics_dash.loading_capacity', { default: 'Loading Capacity' })}</span>
      </div>
    {/if}
  </div>

  <div class="dashboard-grid">
    <!-- Quick Actions -->
    <div class="card">
      <h2>{$t('logistics_dash.quick_actions', { default: 'Quick Actions' })}</h2>
      <div class="actions">
        {#if !user || can(user, 'Logistics')}
          <a href="{base}/calendar" class="action-btn">
            <Icon name="calendar" size="sm" />
            {$t('logistics_dash.view_calendar', { default: 'Delivery Calendar' })}
          </a>
        {/if}
        {#if !user || can(user, 'Logistics')}
          <a href="{base}/inventory" class="action-btn">
            <Icon name="package" size="sm" />
            {$t('logistics_dash.export_manifest', { default: 'Inventory & Manifests' })}
          </a>
        {/if}
        <a href="{base}/orders?status=READY_FOR_DISPATCH" class="action-btn">
          <Icon name="truck" size="sm" />
          {$t('logistics_dash.dispatch_queue', { default: 'Dispatch Queue' })}
        </a>
        <a href="{base}/files" class="action-btn">
          <Icon name="file-text" size="sm" />
          {$t('logistics_dash.documents', { default: 'Documents & PDFs' })}
        </a>
      </div>
    </div>

    <!-- Section Overview -->
    <div class="card">
      <h2>{$t('logistics_dash.section_overview', { default: 'Responsibilities' })}</h2>
      <ul class="overview-list">
        <li>
          <Icon name="calendar-check" size="sm" />
          {$t('logistics_dash.delivery_scheduling', { default: 'Delivery scheduling & loading days' })}
        </li>
        <li>
          <Icon name="package-check" size="sm" />
          {$t('logistics_dash.inventory_tracking', { default: 'Inventory tracking & stock alerts' })}
        </li>
        <li>
          <Icon name="file-text" size="sm" />
          {$t('logistics_dash.manifest_generation', { default: 'Manifest & shipping document generation' })}
        </li>
        <li>
          <Icon name="truck" size="sm" />
          {$t('logistics_dash.loading_assignments', { default: 'Loading bay assignments' })}
        </li>
      </ul>
    </div>

    <!-- Analytics -->
    <div class="card">
      <h2>{$t('logistics_dash.analytics', { default: 'Analytics' })}</h2>
      <p class="card-desc">{$t('logistics_dash.analytics_desc', { default: 'On-time delivery rates, loading bay utilisation and dispatch trends.' })}</p>
      <div class="actions">
        <a href="{base}/analytics" class="action-btn">
          <Icon name="bar-chart-2" size="sm" />
          {$t('logistics_dash.open_analytics', { default: 'Open Analytics' })}
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
.btn-outline-sm:hover { background: var(--bg-2); border-color: var(--brand); }

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
}
.stat-card--loading {
  background: var(--bg-2);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
.stat-card--warn   { border-color: var(--warn); }
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
  text-align: center;
}

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

.overview-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.overview-list li {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-sm);
  color: var(--ink-secondary, var(--muted));
}

@media (max-width: 768px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .dashboard-header { flex-direction: column; }
}
</style>
