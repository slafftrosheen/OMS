<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { ALL_STATIONS } from '$lib/order/workflow';
  import StationBoard from '$lib/components/production/StationBoard.svelte';
  import QRScanner from '$lib/components/qr/QRScanner.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';

  const STATIONS = ALL_STATIONS;
  type BoardOrder = {
    id: string; poNumber?: string | null; title: string; client: string;
    status: string; stageState?: string; dueDate?: string | null;
    priority?: string | number | null;
  };

  let stationOrders = $state<Record<string, BoardOrder[]>>({});
  let boardError = $state<string | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let loadedOnce = $state(false);
  let lastUpdated = $state<string | null>(null);
  let hideEmpty = $state(false);
  let showScanner = $state(false);

  let visibleStations = $derived(
    hideEmpty ? STATIONS.filter(station => (stationOrders[station]?.length ?? 0) > 0) : STATIONS
  );
  let totalOrders = $derived(
    Object.values(stationOrders).reduce((sum, orders) => sum + orders.length, 0)
  );
  let activeStations = $derived(
    STATIONS.filter(station => (stationOrders[station]?.length ?? 0) > 0).length
  );

  async function loadProductionData() {
    if (refreshing) return;
    refreshing = true;
    if (!loadedOnce) loading = true;
    try {
      const response = await fetch('/api/production/board', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not refresh production board (HTTP ${response.status})`);
      const payload = await response.json();
      if (!payload?.success || !payload?.stations) throw new Error('Production board returned invalid data');
      stationOrders = payload.stations;
      boardError = null;
      lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      loadedOnce = true;
    } catch (err) {
      boardError = err instanceof Error ? err.message : 'Could not refresh production board';
      console.error('[Production Board] Refresh failed', err);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function handleQRScan(data: { orderId?: string; station?: string }) {
    showScanner = false;
    if (data.orderId) goto(`/orders/${encodeURIComponent(data.orderId)}`);
    else if (data.station) {
      document.getElementById(`station-${data.station.toUpperCase()}`)?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  onMount(() => {
    void loadProductionData();
    const interval = setInterval(() => {
      if (!document.hidden) void loadProductionData();
    }, 30000);
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>{$t('production.title')} — OMS</title>
</svelte:head>

<main class="production-container">
  <header class="production-header">
    <div>
      <p class="eyebrow">Shop floor / Live production</p>
      <h1 class="page-title">{$t('production.title')}</h1>
      <p class="page-subtitle">View workload by station. Open a workstation to change its production stage.</p>
    </div>
    <div class="header-actions">
      <Button variant="outline" onclick={() => (showScanner = true)}>
        {$t('stationView.scan_qr', { default: 'Scan QR' })}
      </Button>
      <Button variant="primary" onclick={loadProductionData} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : $t('common.refresh', { default: 'Refresh' })}
      </Button>
    </div>
  </header>

  <div class="board-toolbar">
    <div class="board-kpis" aria-label="Production board totals">
      <span><strong>{totalOrders}</strong> active station assignments</span>
      <span><strong>{activeStations}</strong> stations with work</span>
    </div>
    <div class="board-preferences">
      <label class="visibility-toggle">
        <input type="checkbox" bind:checked={hideEmpty} />
        Hide empty stations
      </label>
      <span class="updated" role="status" aria-live="polite">
        {#if lastUpdated}Updated {lastUpdated}{:else if refreshing}Loading latest station data…{:else}Not updated yet{/if}
      </span>
    </div>
  </div>

  {#if boardError}
    <div class="error-banner" role="alert">
      <span>{boardError}. {loadedOnce ? 'Showing the last successfully loaded data.' : 'Check connectivity and retry.'}</span>
      <button onclick={loadProductionData} disabled={refreshing}>Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="stations-grid" aria-label="Loading production stations" aria-busy="true">
      {#each STATIONS.slice(0, 6) as station (station)}
        <div class="loading-board">
          <Skeleton height="28px" width="45%" />
          <Skeleton height="88px" lines={2} />
        </div>
      {/each}
    </div>
    <p class="sr-only" role="status">Loading production stations</p>
  {:else if !loadedOnce}
    <div class="empty-overview">
      <p>Production data is unavailable.</p>
      <button onclick={loadProductionData} disabled={refreshing}>Try again</button>
    </div>
  {:else if visibleStations.length === 0}
    <div class="empty-overview">
      <p>There are no station assignments to display with the current filter.</p>
      <button onclick={() => (hideEmpty = false)}>Show all stations</button>
    </div>
  {:else}
    <div class="stations-grid">
      {#each visibleStations as station (station)}
        <div id={`station-${station}`}>
          <StationBoard {station} orders={stationOrders[station] ?? []} />
        </div>
      {/each}
    </div>
  {/if}
</main>

<QRScanner bind:open={showScanner} onscan={handleQRScan} />

<style>
  .production-container {
    padding: clamp(1rem, 2vw, 2rem);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 1800px;
    margin: 0 auto;
    min-height: 100%;
    color: var(--text);
  }
  .production-header, .board-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .eyebrow { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: .72rem; font-weight: 700; margin: 0 0 .5rem; }
  .page-title { font-size: clamp(1.6rem, 3vw, 2.1rem); margin: 0 0 .25rem; line-height: 1.2; }
  .page-subtitle { font-size: .95rem; color: var(--muted); margin: 0; max-width: 60ch; }
  .header-actions, .board-preferences, .board-kpis { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
  .board-toolbar {
    padding: .85rem 1.1rem;
    border: 1px solid var(--border);
    background: var(--bg-1);
    border-radius: var(--radius-lg, 12px);
  }
  .board-kpis { gap: 1.5rem; font-size: .83rem; color: var(--muted); }
  .board-kpis strong { color: var(--text); font-variant-numeric: tabular-nums; font-size: 1.15rem; margin-right: .25rem; }
  .visibility-toggle { display: inline-flex; align-items: center; gap: .55rem; cursor: pointer; font-size: .83rem; font-weight: 600; }
  .visibility-toggle input { width: 18px; height: 18px; accent-color: var(--brand); }
  .updated { font-size: .75rem; color: var(--muted); white-space: nowrap; }
  .stations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: 1rem;
    align-items: stretch;
  }
  .loading-board { padding: 1.1rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--bg-1); display: grid; gap: 1rem; }
  .error-banner {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: .75rem; padding: .9rem 1rem; border: 1px solid var(--error);
    color: var(--text); background: var(--bg-1); border-radius: .7rem;
    font-size: .88rem;
  }
  .error-banner button, .empty-overview button {
    min-height: 44px; padding: .6rem 1rem; cursor: pointer;
    border: 1px solid var(--border); background: var(--bg-2);
    border-radius: .5rem; color: var(--text); font-weight: 650;
  }
  .empty-overview { text-align: center; padding: 3rem 1rem; color: var(--muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (max-width: 680px) {
    .header-actions { width: 100%; }
    .board-preferences { width: 100%; justify-content: space-between; }
    .stations-grid { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .station-board { scroll-behavior: auto; }
  }
</style>
