<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import { ALL_STATIONS } from '$lib/order/workflow';
  import {base} from '$app/paths';
  import {currentUser} from '$lib/auth/authState.svelte';
  import type {ProductionOversight,OversightKind} from '$lib/order/production-oversight';
  import type {PlanningItem,StationSummary,PlanningTotals} from '$lib/order/production-planning';
  import StationBoard from '$lib/components/production/StationBoard.svelte';
  import QRScanner from '$lib/components/qr/QRScanner.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';

  const STATIONS = ALL_STATIONS;
  let stationOrders = $state<Record<string, PlanningItem[]>>({});
  let stationSummary = $state<Record<string,StationSummary>>({});
  let totals = $state<PlanningTotals|null>(null);
  let alerts = $state<PlanningItem[]>([]);
  let oversight = $state<ProductionOversight|null>(null);
  let oversightKind = $state<'ALL'|OversightKind>('ALL');
  let expandedOversight = $state(false);
  let isManager = $derived(['RD','Boss','HeadOfProduction'].includes($currentUser?.role??''));
  let visibleOversight = $derived((oversight?.signals??[])
    .filter(s=>oversightKind==='ALL'||s.kind===oversightKind)
    .slice(0,expandedOversight?100:10));
  let boardError = $state<string | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let loadedOnce = $state(false);
  let lastUpdated = $state<string | null>(null);
  let hideEmpty = $state(false);
  let showUpcoming = $state(false);
  let attentionOnly = $state(false);
  let showScanner = $state(false);

  let displayOrders = $derived.by(()=>Object.fromEntries(STATIONS.map(station=>[
    station,(stationOrders[station]??[]).filter(o=>
      (showUpcoming||!o.upcoming)&&(!attentionOnly||o.risk!==null))
  ])));
  let visibleStations = $derived(hideEmpty
    ? STATIONS.filter(s=>(displayOrders[s]?.length??0)>0):STATIONS);
  let activeStations = $derived(STATIONS.filter(s=>(stationSummary[s]?.active??0)>0).length);

  async function loadProductionData() {
    if (refreshing) return;
    refreshing = true;
    if (!loadedOnce) loading = true;
    try {
      const response = await fetch('/api/production/board', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not refresh production board (HTTP ${response.status})`);
      const payload = await response.json();
      if (!payload?.success || !payload?.stations || !payload?.workload ||
          !payload?.totals || !Array.isArray(payload.alerts) ||
          (isManager && (!payload.oversight ||
            !Array.isArray(payload.oversight.signals) ||
            typeof payload.oversight.total!=='number')))
        throw new Error('Production planning response is incomplete');
      stationOrders = payload.stations;
      stationSummary = payload.workload;
      totals = payload.totals;
      alerts = payload.alerts;
      oversight = isManager?payload.oversight:null;
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
      <p class="eyebrow">{$t('productionPlanning.eyebrow')}</p>
      <h1 class="page-title">{$t('production.title')}</h1>
      <p class="page-subtitle">{$t('productionPlanning.description')}</p>
    </div>
    <div class="header-actions">
      <a class="planner-link" href={`${base}/production/planner`}>{$t('capacityPlanner.open')}</a>
      <a class="planner-link" href={`${base}/production/performance`}>{$t('productionPerformance.open')}</a>
      <a class="planner-link" href={`${base}/production/exceptions`}>{$t('productionExceptions.open')}</a>
      <Button variant="outline" onclick={() => (showScanner = true)}>
        {$t('stationView.scan_qr', { default: 'Scan QR' })}
      </Button>
      <Button variant="primary" onclick={loadProductionData} disabled={refreshing}>
        {refreshing ? $t('productionPlanning.loading') : $t('common.refresh', { default: 'Refresh' })}
      </Button>
    </div>
  </header>

  <div class="board-toolbar">
    <div class="board-kpis" aria-label="Production board totals">
      <span><strong>{totals?.orders ?? '—'}</strong> {$t('productionPlanning.orders')}</span>
      <span><strong>{totals?.activeAssignments ?? '—'}</strong> {$t('productionPlanning.assignments')}</span>
      <span><strong>{activeStations}</strong> {$t('productionPlanning.activeStations')}</span>
      <span><strong>{totals?.overdue ?? '—'}</strong> {$t('productionPlanning.overdue')}</span>
      <span><strong>{totals?.knownHours ?? '—'}</strong> {$t('productionPlanning.hours')}</span>
    </div>
    <div class="board-preferences">
      <label class="visibility-toggle">
        <input type="checkbox" bind:checked={hideEmpty} />
        {$t('productionPlanning.hideEmpty')}
      </label>
      <label class="visibility-toggle">
        <input type="checkbox" bind:checked={showUpcoming} />
        {$t('productionPlanning.showUpcoming')}
      </label>
      <label class="visibility-toggle">
        <input type="checkbox" bind:checked={attentionOnly} />
        {$t('productionPlanning.attentionOnly')}
      </label>
      <span class="updated" role="status" aria-live="polite">
        {#if lastUpdated}{$t('productionPlanning.updated',{values:{time:lastUpdated}})}
         {:else if refreshing}{$t('productionPlanning.loading')}
         {:else}{$t('productionPlanning.notUpdated')}{/if}
      </span>
    </div>
  </div>

  {#if boardError}
    <div class="error-banner" role="alert">
      <span>{boardError}. {loadedOnce ? $t('productionPlanning.lastGood') : $t('productionPlanning.retryHint')}</span>
      <button onclick={loadProductionData} disabled={refreshing}>{$t('productionPlanning.retry')}</button>
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
    <p class="sr-only" role="status">{$t('productionPlanning.loading')}</p>
  {:else if !loadedOnce}
    <div class="empty-overview">
      <p>{$t('productionPlanning.unavailable')}</p>
      <button onclick={loadProductionData} disabled={refreshing}>{$t('productionPlanning.retry')}</button>
    </div>
  {:else if visibleStations.length === 0}
    <div class="empty-overview">
      <p>{$t('productionPlanning.noResults')}</p>
      <button onclick={() => {hideEmpty=false;showUpcoming=true;attentionOnly=false;}}>
        {$t('productionPlanning.showAll')}
      </button>
    </div>
  {:else}
    {#if alerts.length}
      <section class="board-toolbar attention" aria-label={$t('productionPlanning.attentionTitle')}>
        <strong>{$t('productionPlanning.attentionTitle')}</strong>
        <div class="attention-list">
          {#each alerts.slice(0,8) as item (`${item.station}-${item.id}`)}
            <a href={`/orders/${encodeURIComponent(item.id)}`} class="attention-item">
              {item.poNumber ?? item.title} · {item.station} — {$t(`productionPlanning.risk.${item.risk}`)}
            </a>
          {/each}
        </div>
      </section>
    {/if}
    {#if isManager && oversight}
      <section class="oversight" aria-label={$t('productionOversight.title')}>
        <div class="oversight-head">
          <div>
            <h2>{$t('productionOversight.title')}</h2>
            <p>{$t('productionOversight.explanation')}</p>
          </div>
          <a class="planner-link" href={`${base}/production/exceptions`}>
            {$t('productionOversight.reviewQueue')}
          </a>
        </div>
        <div class="oversight-summary">
          <span><strong>{oversight.unchangedCount}</strong>
            {$t('productionOversight.unchangedCount')}</span>
          <span><strong>{oversight.skippedCount}</strong>
            {$t('productionOversight.skippedCount')}</span>
        </div>
        <div class="oversight-controls">
          <label for="oversight-kind">{$t('productionOversight.filter')}
            <select id="oversight-kind" bind:value={oversightKind}>
              <option value="ALL">{$t('productionOversight.all')}</option>
              <option value="STAGE_UNCHANGED">{$t('productionOversight.stageUnchanged')}</option>
              <option value="MATERIAL_SKIPPED">{$t('productionOversight.materialSkipped')}</option>
            </select>
          </label>
        </div>
        {#if visibleOversight.length===0}
          <p class="oversight-empty">{$t('productionOversight.noFindings')}</p>
        {:else}
          <div class="oversight-list">
            {#each visibleOversight as signal (signal.key)}
              <article class="oversight-row">
                <div>
                  <strong>{signal.poNumber??signal.title??signal.orderId} · {signal.station}</strong>
                  <p>{$t('productionOversight.'+(
                    signal.kind==='STAGE_UNCHANGED'?'stageUnchanged':'materialSkipped'))}
                    · {$t('productionOversight.ago',{values:{hours:signal.elapsedHours}})}
                  </p>
                  {#if signal.reason}
                    <p class="oversight-reason">{signal.reason}</p>
                  {/if}
                </div>
                <a href={`${base}/orders/${encodeURIComponent(signal.orderId)}`}>
                  {$t('productionOversight.inspectOrder')}
                </a>
              </article>
            {/each}
          </div>
          {#if oversight.truncated}
            <p class="oversight-note">{$t('productionOversight.truncated',{
              values:{limit:oversight.previewLimit,total:oversight.total}
            })}</p>
          {/if}
          {#if !expandedOversight && oversight.signals.length>10}
            <button type="button" class="oversight-expand" onclick={()=>expandedOversight=true}>
              {$t('productionOversight.showMore')}
            </button>
          {/if}
        {/if}
      </section>
    {/if}
    {#if totals && totals.missingEstimates>0}
      <p class="estimate-note" role="note">
        {$t('productionPlanning.missingEstimates',{values:{count:totals.missingEstimates}})}
      </p>
    {/if}
    <div class="stations-grid">
      {#each visibleStations as station (station)}
        <div id={`station-${station}`}>
          <StationBoard {station} orders={displayOrders[station] ?? []} summary={stationSummary[station]} />
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
  .planner-link{display:inline-flex;align-items:center;min-height:44px;padding:.5rem .8rem;
    border:1px solid var(--border);border-radius:8px;color:var(--text);
    background:var(--bg-2);font-size:.85rem;font-weight:700;text-decoration:none}
  .planner-link:hover,.planner-link:focus-visible{border-color:var(--brand)}
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
  .attention{align-items:flex-start;flex-direction:column}
  .attention-list{display:flex;flex-wrap:wrap;gap:.5rem}
  .attention-item{padding:.5rem .7rem;background:var(--bg-2);border:1px solid var(--border);
    border-radius:.5rem;color:var(--text);text-decoration:none;font-size:.82rem}
  .attention-item:focus-visible,.attention-item:hover{border-color:var(--brand)}
  .oversight{border:1px solid var(--border);border-radius:var(--radius-lg,12px);
    background:var(--bg-1);padding:1rem;display:grid;gap:.8rem}
  .oversight-head,.oversight-row{display:flex;align-items:flex-start;
    justify-content:space-between;gap:.7rem;flex-wrap:wrap}
  .oversight-head h2{font-size:1.1rem;margin:0}
  .oversight-head p,.oversight-note,.oversight-empty{color:var(--muted);
    font-size:.79rem;margin:.3rem 0}
  .oversight-summary{display:flex;gap:1.2rem;flex-wrap:wrap;
    font-size:.83rem;color:var(--muted)}
  .oversight-summary strong{color:var(--text);font-size:1.1rem}
  .oversight-controls label{display:flex;gap:.6rem;align-items:center;
    font-size:.8rem;font-weight:650}
  .oversight-controls select,.oversight-expand{min-height:38px;border:1px solid var(--border);
    border-radius:8px;padding:.35rem .65rem;background:var(--bg-2);color:var(--text)}
  .oversight-list{display:grid;gap:.5rem}
  .oversight-row{border:1px solid var(--border);padding:.6rem .75rem;
    border-radius:.6rem;overflow-wrap:anywhere}
  .oversight-row strong{font-size:.85rem}
  .oversight-row p{margin:.25rem 0;color:var(--muted);font-size:.78rem}
  .oversight-row .oversight-reason{color:var(--text)}
  .oversight-row a{display:inline-flex;align-items:center;min-height:38px;
    padding:.35rem .6rem;color:var(--brand);font-size:.8rem}
  .oversight-expand{justify-self:start;cursor:pointer}
  .estimate-note{margin:0;font-size:.82rem;color:var(--muted)}
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
