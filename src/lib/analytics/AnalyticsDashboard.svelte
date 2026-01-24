<script lang="ts">
/**
 * Analytics Dashboard Component
 * Main dashboard with KPIs and charts
 */

import { onMount, onDestroy } from 'svelte';
import { 
  TrendingUp, 
  TrendingDown,
  Package,
  Users,
  Calendar,
  Activity,
  AlertCircle,
  Star,
  Camera,
  RefreshCw
} from 'lucide-svelte';

export let refreshInterval = 30; // seconds

let kpis: any = null;
let trends: any = null;
let stationMetrics: any = null;
let loadingMetrics: any = null;
let loading = true;
let error: string | null = null;
let lastRefresh: Date | null = null;
let refreshTimer: number | null = null;

onMount(() => {
  loadDashboard();
  startAutoRefresh();
});

onDestroy(() => {
  stopAutoRefresh();
});

async function loadDashboard() {
  loading = true;
  error = null;

  try {
    // Load all metrics in parallel
    const [kpisRes, trendsRes, stationsRes, loadingRes] = await Promise.all([
      fetch('/api/analytics?type=kpis'),
      fetch('/api/analytics?type=trends&period=30'),
      fetch('/api/analytics?type=stations'),
      fetch('/api/analytics?type=loading&period=14')
    ]);

    if (!kpisRes.ok || !trendsRes.ok || !stationsRes.ok || !loadingRes.ok) {
      throw new Error('Failed to load analytics');
    }

    const [kpisData, trendsData, stationsData, loadingData] = await Promise.all([
      kpisRes.json(),
      trendsRes.json(),
      stationsRes.json(),
      loadingRes.json()
    ]);

    kpis = kpisData.data;
    trends = trendsData.data;
    stationMetrics = stationsData.data;
    loadingMetrics = loadingData.data;
    lastRefresh = new Date();

  } catch (err) {
    console.error('Dashboard load error:', err);
    error = err instanceof Error ? err.message : 'Failed to load dashboard';
  } finally {
    loading = false;
  }
}

function startAutoRefresh() {
  if (refreshInterval > 0) {
    refreshTimer = window.setInterval(() => {
      loadDashboard();
    }, refreshInterval * 1000);
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function handleRefresh() {
  loadDashboard();
}

function getChangeIndicator(current: number, previous: number) {
  if (previous === 0) return { value: 0, positive: true };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(change).toFixed(1),
    positive: change >= 0
  };
}
</script>

<div class="analytics-dashboard">
  <div class="dashboard-header">
    <div class="header-info">
      <h1>Analytics Dashboard</h1>
      {#if lastRefresh}
        <p class="last-refresh">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      {/if}
    </div>

    <button 
      class="refresh-btn"
      on:click={handleRefresh}
      disabled={loading}
      aria-label="Refresh dashboard"
    >
      <RefreshCw size={16} class:spinning={loading} />
      Refresh
    </button>
  </div>

  {#if loading && !kpis}
    <div class="loading-state">
      <RefreshCw size={48} class="spinner" />
      <p>Loading analytics...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <AlertCircle size={48} />
      <p>{error}</p>
      <button class="btn-primary" on:click={loadDashboard}>
        Try Again
      </button>
    </div>
  {:else if kpis}
    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Total Orders</span>
          <div class="card-icon" style="background-color: var(--accent-1);">
            <Package size={20} />
          </div>
        </div>
        <div class="card-value" style="color: var(--accent-1);">
          {kpis.orders.total}
        </div>
        <div class="card-trend">
          +{kpis.orders.thisMonth} this month
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Active Orders</span>
          <div class="card-icon" style="background-color: var(--ok);">
            <Activity size={20} />
          </div>
        </div>
        <div class="card-value" style="color: var(--ok);">
          {kpis.orders.active}
        </div>
        <div class="card-trend">
          {kpis.orders.today} created today
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Open Issues</span>
          <div class="card-icon" style="background-color: {kpis.stations.openIssues > 0 ? 'var(--danger)' : 'var(--ok)'};">
            <AlertCircle size={20} />
          </div>
        </div>
        <div class="card-value" style="color: {kpis.stations.openIssues > 0 ? 'var(--danger)' : 'var(--ok)'};">
          {kpis.stations.openIssues}
        </div>
        <div class="card-trend">
          {kpis.stations.openIssues === 0 ? "All clear!" : "Needs attention"}
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Quality Score</span>
          <div class="card-icon" style="background-color: var(--warn);">
            <Star size={20} />
          </div>
        </div>
        <div class="card-value" style="color: var(--warn);">
          {kpis.stations.qualityScore.toFixed(1)}
        </div>
        <div class="card-trend">
          Last 7 days average
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Loading Capacity</span>
          <div class="card-icon" style="background-color: {kpis.loading.capacityPercentage > 80 ? 'var(--warn)' : 'var(--accent-1)'};">
            <Calendar size={20} />
          </div>
        </div>
        <div class="card-value" style="color: {kpis.loading.capacityPercentage > 80 ? 'var(--warn)' : 'var(--accent-1)'};">
          {kpis.loading.capacityPercentage}%
        </div>
        <div class="card-trend">
          {kpis.loading.capacityUsed}/{kpis.loading.capacityTotal} next 7 days
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Unique Clients</span>
          <div class="card-icon" style="background-color: var(--accent-2);">
            <Users size={20} />
          </div>
        </div>
        <div class="card-value" style="color: var(--accent-2);">
          {kpis.clients.uniqueThisMonth}
        </div>
        <div class="card-trend">
          This month
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Photos Uploaded</span>
          <div class="card-icon" style="background-color: var(--accent-1);">
            <Camera size={20} />
          </div>
        </div>
        <div class="card-value" style="color: var(--accent-1);">
          {kpis.activity.photosToday}
        </div>
        <div class="card-trend">
          Today
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-header">
          <span class="card-title">Avg Completion</span>
          <div class="card-icon" style="background-color: var(--ok);">
            <TrendingUp size={20} />
          </div>
        </div>
        <div class="card-value" style="color: var(--ok);">
          {kpis.orders.avgCompletionHours.toFixed(1)}
        </div>
        <div class="card-trend">
          Hours (last 7 days)
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-section">
      <!-- Order Trends Chart -->
      {#if trends}
        <div class="chart-card">
          <div class="chart-header">
            <h3>Order Trends</h3>
            <span class="chart-period">Last 30 days</span>
          </div>
          <div class="chart-placeholder">
            <p>Order Trends Chart</p>
            <p>Dates: {trends.dates?.length || 0} points</p>
          </div>
        </div>
      {/if}

      <!-- Loading Capacity Chart -->
      {#if loadingMetrics}
        <div class="chart-card">
          <div class="chart-header">
            <h3>Loading Capacity</h3>
            <span class="chart-period">Next 14 days</span>
          </div>
          <div class="chart-placeholder">
            <p>Loading Capacity Chart</p>
            <p>Dates: {loadingMetrics.dates?.length || 0} points</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Station Performance Table -->
    {#if stationMetrics}
      <div class="performance-section">
        <h3>Station Performance</h3>
        <div class="table-container">
          <table class="performance-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Total Logs</th>
                <th>Issues</th>
                <th>Resolved</th>
                <th>Quality</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {#each stationMetrics as station}
                <tr>
                  <td>{station.station}</td>
                  <td>{station.total_logs}</td>
                  <td>{station.total_issues}</td>
                  <td>{station.total_resolved}</td>
                  <td>{station.overall_quality_score?.toFixed(2)}</td>
                  <td>{station.total_orders_processed}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .analytics-dashboard {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
    min-height: 100vh;
    background: var(--bg-0);
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .header-info h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: var(--text);
  }

  .last-refresh {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--bg-2);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .kpi-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .card-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .card-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }

  .card-trend {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .charts-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
    gap: 1.5rem;
  }

  .chart-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .chart-header h3 {
    margin: 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .chart-period {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .chart-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    background: var(--bg-0);
    border: 1px dashed var(--border);
    border-radius: 6px;
    color: var(--muted);
  }

  .performance-section {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .performance-section h3 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .table-container {
    overflow-x: auto;
  }

  .performance-table {
    width: 100%;
    border-collapse: collapse;
  }

  .performance-table th,
  .performance-table td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .performance-table th {
    background: var(--bg-0);
    font-weight: 600;
    color: var(--text);
  }

  .performance-table tbody tr:hover {
    background: var(--bg-0);
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 4rem 2rem;
    text-align: center;
    color: var(--muted);
  }

  .error-state {
    color: var(--danger);
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .btn-primary {
    padding: 0.5rem 1rem;
    background: var(--accent-1);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  @media (max-width: 1200px) {
    .charts-section {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .analytics-dashboard {
      padding: 1rem;
      gap: 1rem;
    }

    .header-info h1 {
      font-size: 1.5rem;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }
</style>