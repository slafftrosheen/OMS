<script lang="ts">
  export let params = {};
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  
  import { listOrders } from '$lib/order/signage-store';
  import type { Order, Station } from '$lib/order/types';
  import { STATIONS } from '$lib/order/stages';
  import { TERMS } from '$lib/order/names';
  import { AlertCircle, Clock, TrendingUp, Package, Activity, Layers } from 'lucide-svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import { badgeTone } from '$lib/order/badges';
  
  let orders: Order[] = [];
  
  onMount(async () => {
    orders = await listOrders();
    
    const handler = async (event: StorageEvent) => {
      if (!event.key || event.key === 'rf_orders_vcs') {
        orders = await listOrders();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  });
  
  const stationLabel = (code: Station) => $t(TERMS.stations[code]);
  
  // Calculate station workload
  function getStationWorkload(station: Station) {
    const stationOrders = orders.filter(order => {
      const state = order.stages?.[station];
      return state && state !== 'COMPLETED' && state !== 'NOT_STARTED';
    });
    
    const inProgress = stationOrders.filter(o => o.stages?.[station] === 'IN_PROGRESS').length;
    const queued = stationOrders.filter(o => o.stages?.[station] === 'QUEUED').length;
    const blocked = stationOrders.filter(o => o.stages?.[station] === 'BLOCKED').length;
    const rework = stationOrders.filter(o => o.stages?.[station] === 'REWORK').length;
    
    return { total: stationOrders.length, inProgress, queued, blocked, rework };
  }
  
  // Get recent orders (last 7 days or latest 10)
  function getRecentOrders(): Order[] {
    // Sort by most recent first (assuming creation order)
    return orders.slice(-10).reverse();
  }
  
  // Get urgent orders
  function getUrgentOrders(): Order[] {
    return orders.filter(order => {
      if (order.badges?.includes('URGENT')) return true;
      if (order.badges?.includes('BLOCKED')) return true;
      
      // Check if due soon (within 3 days)
      const dueDate = new Date(order.due);
      const today = new Date();
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 3 && diffDays >= 0;
    });
  }
  
  // Get pipeline status - orders by stage
  function getPipelineStatus() {
    const pipeline: { station: Station; count: number; label: string }[] = [];
    
    for (const station of STATIONS) {
      const count = orders.filter(order => {
        const state = order.stages?.[station];
        return state && state !== 'COMPLETED' && state !== 'NOT_STARTED';
      }).length;
      
      pipeline.push({
        station,
        count,
        label: stationLabel(station)
      });
    }
    
    return pipeline;
  }
  
  $: stationWorkloads = STATIONS.map(s => ({ station: s, ...getStationWorkload(s) }));
  $: recentOrders = getRecentOrders();
  $: urgentOrders = getUrgentOrders();
  $: pipelineStatus = getPipelineStatus();
  $: activeOrders = orders.filter(o => !o.isDraft).length;
  $: blockedOrders = orders.filter(o => o.badges?.includes('BLOCKED')).length;
  $: totalReworks = orders.reduce((sum, o) => sum + (o.redo?.length || 0), 0);
</script>

<svelte:head>
  <title>Dashboard - Reclame OMS</title>
</svelte:head>

<div class="dashboard-page">
  <!-- Top Stats Bar -->
  <div class="stats-bar">
    <div class="stat-card">
      <div class="stat-icon active">
        <Package size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-label">Active Orders</span>
        <span class="stat-value">{activeOrders}</span>
      </div>
    </div>
    
    <div class="stat-card">
      <div class="stat-icon urgent">
        <AlertCircle size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-label">Urgent / Due Soon</span>
        <span class="stat-value">{urgentOrders.length}</span>
      </div>
    </div>
    
    <div class="stat-card">
      <div class="stat-icon blocked">
        <Activity size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-label">Blocked</span>
        <span class="stat-value">{blockedOrders}</span>
      </div>
    </div>
    
    <div class="stat-card">
      <div class="stat-icon rework">
        <TrendingUp size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-label">Total Reworks</span>
        <span class="stat-value">{totalReworks}</span>
      </div>
    </div>
  </div>
  
  <!-- Main Content Grid -->
  <div class="content-grid">
    <!-- Production Pipeline -->
    <div class="panel pipeline-panel">
      <div class="panel-header">
        <h2>
          <Layers size={20} />
          Production Pipeline
        </h2>
      </div>
      <div class="panel-body">
        <div class="pipeline-flow">
          {#each pipelineStatus as stage, index}
            <div class="pipeline-stage">
              <div class="stage-count" class:has-work={stage.count > 0}>
                {stage.count}
              </div>
              <div class="stage-label">{stage.label}</div>
              {#if index < pipelineStatus.length - 1}
                <div class="stage-arrow">→</div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
    
    <!-- Station Workload -->
    <div class="panel workload-panel">
      <div class="panel-header">
        <h2>
          <Activity size={20} />
          Station Workload
        </h2>
      </div>
      <div class="panel-body">
        <div class="workload-list">
          {#each stationWorkloads as { station, total, inProgress, queued, blocked, rework }}
            {#if total > 0}
              <div class="workload-item">
                <div class="workload-station">
                  <span class="station-name">{stationLabel(station)}</span>
                  <span class="station-total">{total} orders</span>
                </div>
                <div class="workload-details">
                  {#if inProgress > 0}
                    <span class="work-badge progress">{inProgress} in progress</span>
                  {/if}
                  {#if queued > 0}
                    <span class="work-badge queued">{queued} queued</span>
                  {/if}
                  {#if blocked > 0}
                    <span class="work-badge blocked">{blocked} blocked</span>
                  {/if}
                  {#if rework > 0}
                    <span class="work-badge rework">{rework} rework</span>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
    
    <!-- Urgent Orders -->
    <div class="panel urgent-panel">
      <div class="panel-header">
        <h2>
          <AlertCircle size={20} />
          Urgent & Due Soon
        </h2>
      </div>
      <div class="panel-body">
        {#if urgentOrders.length === 0}
          <div class="empty-state">
            <p>No urgent orders</p>
          </div>
        {:else}
          <div class="orders-list">
            {#each urgentOrders.slice(0, 8) as order}
              <div class="order-item">
                <div class="order-info">
                  <span class="order-id">{order.id}</span>
                  <span class="order-client">{order.client}</span>
                </div>
                <div class="order-badges">
                  {#each order.badges as badge}
                    <Badge tone={badgeTone(badge)} label={badge}>
                      <span class="badge-mini">{badge}</span>
                    </Badge>
                  {/each}
                </div>
                <span class="order-due">
                  <Clock size={12} />
                  {order.due}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    
    <!-- Recent Orders -->
    <div class="panel recent-panel">
      <div class="panel-header">
        <h2>
          <Package size={20} />
          Recent Orders
        </h2>
      </div>
      <div class="panel-body">
        <div class="orders-list">
          {#each recentOrders.slice(0, 8) as order}
            <div class="order-item">
              <div class="order-info">
                <span class="order-id">{order.id}</span>
                <span class="order-client">{order.client}</span>
              </div>
              <span class="order-title">{order.title}</span>
              <div class="order-badges">
                {#each order.badges as badge}
                  <Badge tone={badgeTone(badge)} label={badge}>
                    <span class="badge-mini">{badge}</span>
                  </Badge>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .dashboard-page {
    padding: var(--space-lg);
    background: var(--bg-0);
    min-height: 100vh;
  }
  
  /* Top Stats Bar */
  .stats-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  
  .stat-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  
  .stat-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
  }
  
  .stat-icon.active {
    background: color-mix(in oklab, #3b82f6 15%, transparent);
    color: #3b82f6;
  }
  
  .stat-icon.urgent {
    background: color-mix(in oklab, #f59e0b 15%, transparent);
    color: #f59e0b;
  }
  
  .stat-icon.blocked {
    background: color-mix(in oklab, #ef4444 15%, transparent);
    color: #ef4444;
  }
  
  .stat-icon.rework {
    background: color-mix(in oklab, #8b5cf6 15%, transparent);
    color: #8b5cf6;
  }
  
  .stat-content {
    display: flex;
    flex-direction: column;
  }
  
  .stat-label {
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 500;
  }
  
  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
  }
  
  /* Content Grid */
  .content-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-lg);
  }
  
  .panel {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  
  .pipeline-panel {
    grid-column: span 2;
  }
  
  .panel-header {
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border);
  }
  
  .panel-header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .panel-body {
    padding: var(--space-lg);
  }
  
  /* Pipeline Flow */
  .pipeline-flow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    overflow-x: auto;
    padding: var(--space-md) 0;
  }
  
  .pipeline-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    position: relative;
    flex: 1;
    min-width: 80px;
  }
  
  .stage-count {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bg-2);
    color: var(--muted);
    font-size: 1.25rem;
    font-weight: 700;
    border: 2px solid var(--border);
  }
  
  .stage-count.has-work {
    background: var(--accent-1);
    color: white;
    border-color: var(--accent-1);
  }
  
  .stage-label {
    font-size: 0.75rem;
    color: var(--text);
    text-align: center;
    font-weight: 500;
  }
  
  .stage-arrow {
    position: absolute;
    right: -16px;
    top: 20px;
    color: var(--border);
    font-size: 1.5rem;
  }
  
  /* Workload List */
  .workload-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  
  .workload-item {
    padding: var(--space-md);
    background: var(--bg-0);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
  }
  
  .workload-station {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }
  
  .station-name {
    font-weight: 600;
    color: var(--text);
  }
  
  .station-total {
    font-size: 0.875rem;
    color: var(--muted);
  }
  
  .workload-details {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  
  .work-badge {
    padding: var(--space-xxs) var(--space-sm);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .work-badge.progress {
    background: color-mix(in oklab, #3b82f6 15%, transparent);
    color: #3b82f6;
  }
  
  .work-badge.queued {
    background: color-mix(in oklab, #6b7280 15%, transparent);
    color: #6b7280;
  }
  
  .work-badge.blocked {
    background: color-mix(in oklab, #ef4444 15%, transparent);
    color: #ef4444;
  }
  
  .work-badge.rework {
    background: color-mix(in oklab, #f59e0b 15%, transparent);
    color: #f59e0b;
  }
  
  /* Orders List */
  .orders-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    max-height: 400px;
    overflow-y: auto;
  }
  
  .order-item {
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    transition: all 0.2s ease;
  }
  
  .order-item:hover {
    border-color: var(--accent-1);
  }
  
  .order-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    flex: 1;
  }
  
  .order-id {
    font-weight: 600;
    color: var(--accent-1);
    font-size: 0.875rem;
  }
  
  .order-client {
    font-size: 0.75rem;
    color: var(--muted);
  }
  
  .order-title {
    font-size: 0.75rem;
    color: var(--text);
    flex: 1;
  }
  
  .order-badges {
    display: flex;
    gap: var(--space-xxs);
    flex-wrap: wrap;
  }
  
  .badge-mini {
    font-size: 0.65rem;
  }
  
  .order-due {
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    font-size: 0.75rem;
    color: var(--muted);
  }
  
  .empty-state {
    text-align: center;
    padding: var(--space-2xl);
    color: var(--muted);
  }
  
  .empty-state p {
    margin: 0;
  }
  
  @media (max-width: 1280px) {
    .stats-bar {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .content-grid {
      grid-template-columns: 1fr;
    }
    
    .pipeline-panel {
      grid-column: span 1;
    }
  }
  
  @media (max-width: 768px) {
    .stats-bar {
      grid-template-columns: 1fr;
    }
    
    .pipeline-flow {
      flex-wrap: wrap;
      justify-content: center;
    }
    
    .stage-arrow {
      display: none;
    }
  }
</style>
