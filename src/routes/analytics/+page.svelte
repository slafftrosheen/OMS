<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';

  interface AnalyticsData {
    statistics: {
      total_orders: number;
      active_orders: number;
      completed_orders: number;
      avg_completion_days: number;
      total_rework: number;
    };
    orders_at_risk: any[];
    station_workload: Record<string, any[]>;
    top_rework_stations: any[];
    orders_by_status: any[];
    completion_trend: any[];
  }

  const analytics = writable<AnalyticsData | null>(null);
  const loading = writable(true);
  const timeframe = writable('30d');

  async function loadAnalytics() {
    $loading = true;
    try {
      const response = await fetch(`/api/orders/analytics?timeframe=${$timeframe}`);
      if (!response.ok) throw new Error('Failed to load analytics');

      const data = await response.json();
      $analytics = data;
    } catch (err) {
      console.error('Analytics error:', err);
    } finally {
      $loading = false;
    }
  }

  onMount(loadAnalytics);

  $effect(() => {
    if ($timeframe) loadAnalytics();
  });
</script>

<svelte:head>
  <title>Analytics Dashboard - OMS</title>
</svelte:head>

<div class="analytics-page">
  <header class="page-header">
    <h1>Analytics Dashboard</h1>
    <div class="timeframe-selector">
      <button
        class="timeframe-btn"
        class:active={$timeframe === '7d'}
        on:click={() => $timeframe = '7d'}
      >
        Last 7 Days
      </button>
      <button
        class="timeframe-btn"
        class:active={$timeframe === '30d'}
        on:click={() => $timeframe = '30d'}
      >
        Last 30 Days
      </button>
      <button
        class="timeframe-btn"
        class:active={$timeframe === '90d'}
        on:click={() => $timeframe = '90d'}
      >
        Last 90 Days
      </button>
      <button
        class="timeframe-btn"
        class:active={$timeframe === '1y'}
        on:click={() => $timeframe = '1y'}
      >
        Last Year
      </button>
    </div>
  </header>

  {#if $loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading analytics...</p>
    </div>
  {:else if $analytics}
    <!-- Key Metrics -->
    <section class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">📊</div>
        <div class="metric-content">
          <span class="metric-value">{$analytics.statistics.total_orders || 0}</span>
          <span class="metric-label">Total Orders</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">🔵</div>
        <div class="metric-content">
          <span class="metric-value">{$analytics.statistics.active_orders || 0}</span>
          <span class="metric-label">Active Orders</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">✅</div>
        <div class="metric-content">
          <span class="metric-value">{$analytics.statistics.completed_orders || 0}</span>
          <span class="metric-label">Completed</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">⏱️</div>
        <div class="metric-content">
          <span class="metric-value">{($analytics.statistics.avg_completion_days || 0).toFixed(1)}</span>
          <span class="metric-label">Avg Days to Complete</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">🔄</div>
        <div class="metric-content">
          <span class="metric-value">{$analytics.statistics.total_rework || 0}</span>
          <span class="metric-label">Total Rework</span>
        </div>
      </div>
    </section>

    <!-- Orders at Risk -->
    {#if $analytics.orders_at_risk.length > 0}
      <section class="section-card">
        <h2>⚠️ Orders at Risk</h2>
        <div class="risk-list">
          {#each $analytics.orders_at_risk.slice(0, 5) as order}
            <div class="risk-item">
              <div class="risk-header">
                <span class="po-number">{order.po_number}</span>
                <span class="risk-badge">{order.risk_reason}</span>
              </div>
              <div class="risk-details">
                <span>{order.title}</span>
                <span class="text-muted">{order.client}</span>
              </div>
              {#if order.days_until_due !== null}
                <div class="risk-due">
                  Due: {order.days_until_due < 0 ?
                    `${Math.abs(order.days_until_due)}d overdue` :
                    `${order.days_until_due}d left`}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Station Workload -->
    <section class="section-card">
      <h2>🏭 Station Workload</h2>
      <div class="station-grid">
        {#each Object.entries($analytics.station_workload) as [station, workload]}
          <div class="station-card">
            <h3>{station}</h3>
            <div class="workload-stats">
              {#each workload as item}
                <div class="workload-item">
                  <span class="status-dot status-{item.status.toLowerCase()}"></span>
                  <span class="status-label">{item.status}:</span>
                  <span class="status-count">{item.count}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Top Rework Stations -->
    {#if $analytics.top_rework_stations.length > 0}
      <section class="section-card">
        <h2>🔧 Top Rework Stations</h2>
        <div class="rework-chart">
          {#each $analytics.top_rework_stations as item}
            <div class="rework-bar">
              <span class="rework-station">{item.station}</span>
              <div class="rework-bar-bg">
                <div
                  class="rework-bar-fill"
                  style="width: {(item.count / $analytics.top_rework_stations[0].count) * 100}%"
                />
              </div>
              <span class="rework-count">{item.count}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .analytics-page {
    padding: 2rem;
    max-width: 1600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .page-header h1 {
    margin: 0;
    font-size: 2rem;
    color: var(--text);
  }

  .timeframe-selector {
    display: flex;
    gap: 0.5rem;
    background: var(--bg-1);
    padding: 0.25rem;
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .timeframe-btn {
    padding: 0.5rem 1rem;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    color: var(--text);
    transition: all 0.2s ease;
  }

  .timeframe-btn:hover {
    background: var(--bg-2);
  }

  .timeframe-btn.active {
    background: var(--accent-1);
    color: white;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .metric-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .metric-icon {
    font-size: 2.5rem;
  }

  .metric-content {
    display: flex;
    flex-direction: column;
  }

  .metric-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }

  .metric-label {
    font-size: 0.875rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 0.25rem;
  }

  .section-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .section-card h2 {
    margin: 0 0 1.5rem 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .risk-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .risk-item {
    padding: 1rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-left: 3px solid var(--danger);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .risk-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .po-number {
    font-family: 'Courier New', monospace;
    font-weight: 600;
    color: var(--text);
  }

  .risk-badge {
    padding: 0.25rem 0.5rem;
    background: var(--danger);
    color: white;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .risk-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
  }

  .text-muted {
    color: var(--muted);
  }

  .risk-due {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--danger);
  }

  .station-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }

  .station-card {
    padding: 1rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .station-card h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: var(--text);
  }

  .workload-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .workload-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.status-queued { background: #17a2b8; }
  .status-dot.status-in_progress { background: #007bff; }
  .status-dot.status-blocked { background: #dc3545; }
  .status-dot.status-rework { background: #ffc107; }

  .status-label {
    color: var(--muted);
  }

  .status-count {
    font-weight: 600;
    color: var(--text);
    margin-left: auto;
  }

  .rework-chart {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .rework-bar {
    display: grid;
    grid-template-columns: 100px 1fr 60px;
    align-items: center;
    gap: 1rem;
  }

  .rework-station {
    font-weight: 600;
    color: var(--text);
  }

  .rework-bar-bg {
    height: 32px;
    background: var(--bg-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .rework-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--warn), var(--danger));
    transition: width 0.3s ease;
  }

  .rework-count {
    text-align: right;
    font-weight: 700;
    color: var(--text);
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    color: var(--muted);
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--border);
    border-top-color: var(--accent-1);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .analytics-page {
      padding: 1rem;
    }

    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .metrics-grid {
      grid-template-columns: 1fr;
    }

    .station-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
