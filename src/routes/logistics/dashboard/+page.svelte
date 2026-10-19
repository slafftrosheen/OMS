<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';

  let user = $derived($currentUser);

  interface LogisticsStats {
    pending_dispatch: number | null;
    scheduled_today: number | null;
    overdue: number | null;
    loading_capacity_pct: number | null;
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
      const cal  = calRes.ok ? await calRes.json() : {};
      const load = loadRes.ok ? await loadRes.json() : {};
      // Unavailable aggregates are unknown, not zero. Preserve genuine zero values.
      const numeric = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) ? value : null;
      stats = {
        pending_dispatch: numeric(cal.pending_dispatch),
        scheduled_today: numeric(cal.scheduled_today),
        overdue: numeric(cal.overdue),
        loading_capacity_pct: numeric(load.capacity_pct),
      };
    } catch {
      stats = null; // Keep the dashboard usable, never fabricate live metrics.
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
        <span class="stat-value">{stats?.loading_capacity_pct ?? '—'}{stats?.loading_capacity_pct != null ? '%' : ''}</span>
        <span class="stat-label">{$t('logistics_dash.loading_capacity', { default: 'Loading Capacity' })}</span>
      </div>
    {/if}
  </div>

  <div class="dashboard-grid">
    <!-- Quick Actions -->
    <div class="card">
      <h2>{$t('logistics_dash.quick_actions', { default: 'Quick Actions' })}</h2>
      <div class="actions">
        {#if user && can(user, 'viewCalendar')}
          <a href="{base}/calendar" class="action-btn">
            <Icon name="calendar" size="sm" />
            {$t('logistics_dash.view_calendar', { default: 'Delivery Calendar' })}
          </a>
        {/if}
        {#if user && can(user, 'viewInventory')}
          <a href="{base}/inventory" class="action-btn">
            <Icon name="package" size="sm" />
            {$t('logistics_dash.export_manifest', { default: 'Inventory & Manifests' })}
          </a>
        {/if}
        <a href="{base}/orders" class="action-btn">
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

  /* Logistics is a live operator console, not a promotional landing card grid. */
  .dashboard-container {padding:var(--space-lg) 0 var(--space-2xl);gap:var(--space-lg);max-width:1320px;}
  .dashboard-header {position:relative;border-bottom:1px solid var(--divider);padding:var(--space-lg) 0;}
  .dashboard-header::before {content:'';position:absolute;left:0;top:0;width:88px;height:2px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  .dashboard-header h1 {font-size:clamp(1.6rem,2.6vw,2.15rem);letter-spacing:var(--tracking-tight);}
  .role-badge {border-radius:var(--radius-sm);border:1px solid color-mix(in oklab,var(--brand) 35%,var(--border));}
  .btn-outline-sm {min-height:44px;border-radius:var(--radius-md);}
  .btn-outline-sm:focus-visible,.action-btn:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
  .stats-row {grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-sm);}
  .stat-card {align-items:flex-start;text-align:start;min-width:0;min-height:105px;
    border-radius:var(--radius-md);background:var(--bg-1);border-color:var(--glass-border);
    padding:var(--space-lg);gap:var(--space-sm);}
  .stat-value {font-size:clamp(1.4rem,2.2vw,1.9rem);font-variant-numeric:tabular-nums;}
  .stat-label {text-align:start;letter-spacing:.02em;text-transform:none;line-height:1.3;}
  .stat-card--warn {border-color:color-mix(in oklab,var(--warn) 45%,var(--border));}
  .stat-card--danger {border-color:color-mix(in oklab,var(--error) 45%,var(--border));}
  .stat-card--warn .stat-value {color:var(--warn);}
  .stat-card--danger .stat-value {color:var(--error);}
  .dashboard-grid {grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));
    gap:var(--space-md);}
  .card {min-width:0;background:var(--glass-bg-strong);border-color:var(--glass-border);
    border-radius:var(--radius-lg);padding:var(--space-xl);box-shadow:var(--glass-shadow-sm);}
  .card h2 {font-size:var(--text-lg);}
  .actions {gap:var(--space-sm);}
  .action-btn {min-height:44px;background:var(--bg-1);border:1px solid var(--border);
    border-radius:var(--radius-sm);font-weight:650;color:var(--ink-secondary);}
  .action-btn:hover {color:var(--ink-primary);background:var(--bg-2);}
  .overview-list li {line-height:1.5;}
  @media(max-width:760px) {
    .dashboard-container {padding:var(--space-sm) 0 var(--space-xl);}
    .stats-row {grid-template-columns:repeat(2,minmax(0,1fr));}
    .card {padding:var(--space-lg);}
  }
  @media(prefers-reduced-motion:reduce) {.stat-card--loading {animation:none;}}
  @media(prefers-reduced-transparency:reduce) {.card {background:var(--bg-1);}}
</style>
