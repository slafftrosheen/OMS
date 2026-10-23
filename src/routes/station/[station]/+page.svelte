<script lang="ts">
  import { modalDialog } from '$lib/ui/modal-dialog';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { canOperateStation } from '$lib/order/lifecycle-guards';
  import { dueDateLabel, stageStateLabel, isOrderOverdue } from '$lib/order/operator-ui';
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import { realtimeStore } from '$lib/stores/realtime';
  import QRScanner from '$lib/components/qr/QRScanner.svelte';
  import StationCompleteModal from '$lib/components/station/StationCompleteModal.svelte';
  import StationProgressPanel from '$lib/components/station/StationProgressPanel.svelte';
  import StationProductionPacket from '$lib/components/station/StationProductionPacket.svelte';
  import { notifications } from '$lib/notify/store';
  import { ensureRoom, loadMessages } from '$lib/chat/chat-store';
  import ChatPane from '$lib/ui/ChatPane.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import OrderBadges from '$lib/badges/OrderBadges.svelte';
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import { priorityBadge, stageBadge } from '$lib/badges/catalog';

  let station = $derived(page.params.station.toUpperCase());
  let stationRoomId = $derived(`station-${page.params.station.toLowerCase()}`);

  interface StationOrder {
    id: string;
    po_number: string;
    title: string;
    client: string;
    stage: any;
    priority: string | number;
    due_date: string;
  }

  const orders = writable<StationOrder[]>([]);
  const loading = writable(true);
  const filter = writable<'ALL' | 'QUEUED' | 'IN_PROGRESS' | 'BLOCKED' | 'REWORK'>('ALL');
  const showScanner = writable(false);
  let loadError = $state<string | null>(null);
  let hasLoaded = $state(false);
  let refreshing = $state(false);
  let lastUpdated = $state<string | null>(null);
  let searchQuery = $state('');
  let workingOnOrderId = $state<string | null>(null);
  let operationMessage = $state<string | null>(null);
  let resolveModalOpen = $state(false);
  let resolveOrderId = $state('');
  let resolveReworkId = $state('');
  let resolutionNotes = $state('');
  let resolutionBusy = $state(false);
  let operatorCanAct = $derived(canOperateStation($currentUser, station));
  let todayLocal = $state(new Date().toLocaleDateString('sv-SE'));

  let completeModalOpen = $state(false);
  let completeTarget = $state<StationOrder | null>(null);
  let progressTarget = $state<StationOrder | null>(null);
  let progressBusy = $state(false);
  let packetTarget = $state<StationOrder | null>(null);
  let showChat = $state(false);

  // Block modal state
  let blockModalOpen = $state(false);
  let blockTargetId = $state('');
  let blockReason = $state('');

  // Rework modal state
  let reworkModalOpen = $state(false);
  let reworkTargetId = $state('');
  let reworkReason = $state('RECUT');
  let reworkDescription = $state('');
  const REWORK_REASONS = ['RECUT', 'RESAND', 'REBEND', 'REWELD', 'REPAINT', 'RECOAT', 'REGLUE', 'REASSEMBLE', 'RECHECK', 'CUSTOM'];

  let unsubscribe: (() => void) | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function loadStationOrders(quiet = false) {
    if (refreshing) return;
    refreshing = true;
    if (!hasLoaded) $loading = true;
    try {
      const response = await fetch(`/api/station/${encodeURIComponent(station)}/orders`, { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Session expired — sign in again.'
        : response.status === 403 ? 'You cannot view this station.' :
          `Station refresh failed (HTTP ${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid station queue response');
      $orders = data;
      loadError = null;
      hasLoaded = true;
      lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      todayLocal = new Date().toLocaleDateString('sv-SE');
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Failed to load station';
      if (!quiet) notifications.error(loadError);
    } finally {
      refreshing = false;
      $loading = false;
    }
  }

  async function updateStageState(orderId: string, state: string,
      extras: Record<string, unknown> = {}): Promise<boolean> {
    if (workingOnOrderId) return false;
    if (!operatorCanAct) { notifications.error('Station assignment required'); return false; }
    workingOnOrderId = orderId;
    operationMessage = null;
    try {
      const stageRow = $orders.find(o=>o.id===orderId)?.stage;
      if (!stageRow?.updated_at) {
        notifications.error($t('productionFloor.staleStage'));
        await loadStationOrders(true);
        return false;
      }
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/stages?station=${encodeURIComponent(station)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, ...extras, expectedUpdatedAt:stageRow.updated_at })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status===409 || response.status===428) await loadStationOrders(true);
        throw new Error(response.status===409 || response.status===428
          ? $t('productionFloor.staleStage')
          : body?.message ?? body?.error ?? `Stage change rejected (HTTP ${response.status})`);
      }
      operationMessage = `${station}: ${stageStateLabel(state)} saved`;
      await loadStationOrders(true);
      return true;
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Stage update failed');
      return false;
    } finally { workingOnOrderId = null; }
  }

  async function handleQRScan(data: unknown) {
    const result = data && typeof data === 'object' ? data as { valid?: unknown; orderId?: unknown } : null;
    if (result?.valid !== true || typeof result.orderId !== 'string' || !result.orderId.trim()) {
      notifications.error('Unrecognized OMS QR code');
      return;
    }
    const id = result.orderId.trim();
    // Scan identifies an order. Starting production remains an explicit action.
    $showScanner = false;
    await goto(`/orders/${encodeURIComponent(id)}`);
  }

  async function startOrder(id: string) {
    await updateStageState(id, 'IN_PROGRESS');
  }

  function openProgress(orderId:string) {
    const target=$orders.find(o=>o.id===orderId);
    if (target?.stage?.state==='IN_PROGRESS') progressTarget=target;
  }

  function completeOrder(orderId: string) {
    const target = $orders.find((o) => o.id === orderId);
    // Only a current IN_PROGRESS stage can complete. A stale version or
    // rework transition is rechecked atomically in the R38 RPC.
    if(!operatorCanAct || !target || target.stage?.state!=='IN_PROGRESS' ||
       typeof target.stage?.updated_at!=='string'){
      notifications.error($t('productionFloor.staleStage'));
      void loadStationOrders(true);
      return;
    }
    completeTarget = target;
    completeModalOpen = true;
  }

  async function submitCompletion(
    items: Array<{ item_id: string; quantity: number }>,
    opts: { skipped: boolean; skipReason: string | null; actualHours?:number|null; notes?:string|null },
  ) {
    if (!completeTarget || !operatorCanAct ||
        completeTarget.stage?.state!=='IN_PROGRESS' ||
        typeof completeTarget.stage?.updated_at!=='string')
      return {ok:false,error:$t('productionFloor.staleStage')};
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(completeTarget.id)}/stages/${encodeURIComponent(station)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items, skipped: opts.skipped, skipReason: opts.skipReason,
            actualHours:opts.actualHours, notes:opts.notes,
            expectedUpdatedAt:completeTarget.stage.updated_at
          }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if(res.status===409 || res.status===428){
          void loadStationOrders(true);
          return {ok:false,error:payload?.reason==='INVENTORY_PARITY'
            ?$t('inventoryConsistency.operatorMismatch')
            :payload?.reason==='INSUFFICIENT_STOCK'
              ?$t('inventoryConsistency.operatorShortage')
              :$t('productionFloor.staleStage')};
        }
        return {ok:false,error:payload?.error??`HTTP ${res.status}`};
      }
      return { ok: true, consumed: payload?.consumed ?? 0, lowStock: payload?.lowStock ?? [],
        nextStation:payload?.handoffQueued===true?payload?.nextStation??null:null,
        handoffStatusKnown:payload?.handoffStatusKnown===true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Network error' };
    }
  }

  function onCompletionSubmitted(p: { consumed: number; skipped: boolean; lowStock: any[]; nextStation?:string|null;handoffStatusKnown?:boolean }) {
    completeTarget = null;
    operationMessage = p.nextStation
      ? $t('productionFloor.handoff',{values:{station:p.nextStation}})
      : $t('productionFloor.completed');
    const consumption=$t(p.skipped?'productionExecution.skipped':'productionExecution.declared',
      {values:{count:p.consumed}});
    notifications.success(consumption);
    if(p.handoffStatusKnown===false)
      notifications.warning($t('productionExecution.handoffUnknown'));
    if (p.lowStock.length > 0) {
      const skus = p.lowStock.map((h: any) => h.sku || h.name).join(', ');
      notifications.warning(
        $t('stationView.low_stock_warning', { default: `Low stock: ${skus}. HoP has been notified.`, values: { skus } })
      );
    }
    void loadStationOrders(true);
  }

  function openBlockModal(orderId: string) {
    blockTargetId = orderId;
    blockReason = '';
    blockModalOpen = true;
  }

  async function submitBlock() {
    if (!blockReason.trim()) return;
    if (await updateStageState(blockTargetId, 'BLOCKED', { blocked_reason: blockReason.trim() })) {
      blockModalOpen = false;
    }
  }

  function openReworkModal(orderId: string) {
    reworkTargetId = orderId;
    reworkReason = 'RECUT';
    reworkDescription = '';
    reworkModalOpen = true;
  }

  async function submitRework() {
    if (!reworkDescription.trim() || workingOnOrderId) return;
    workingOnOrderId = reworkTargetId;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(reworkTargetId)}/rework`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station, reason: reworkReason, description: reworkDescription.trim() })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Rework rejected (HTTP ${res.status})`);
      reworkModalOpen = false;
      operationMessage = 'Rework opened; resolution is required before completion.';
      await loadStationOrders(true);
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to create rework');
    } finally { workingOnOrderId = null; }
  }

  async function openResolveRework(orderId: string) {
    if (workingOnOrderId) return;
    workingOnOrderId = orderId;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/rework?station=${encodeURIComponent(station)}`);
      const cycles = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(cycles)) throw new Error('Could not load rework cycles');
      const open = cycles.find((item: { resolved_at?: string | null }) => !item.resolved_at);
      if (!open) throw new Error('No open rework cycle. Refresh the queue.');
      resolveOrderId = orderId;
      resolveReworkId = open.id;
      resolutionNotes = '';
      resolveModalOpen = true;
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Rework lookup failed');
    } finally { workingOnOrderId = null; }
  }

  async function submitResolution() {
    if (!resolutionNotes.trim() || resolutionBusy) return;
    resolutionBusy = true;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(resolveOrderId)}/rework?rework_id=${encodeURIComponent(resolveReworkId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: resolutionNotes.trim() })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Resolution rejected (HTTP ${res.status})`);
      resolveModalOpen = false;
      operationMessage = 'Rework resolved. Stage returned to In Progress.';
      await loadStationOrders(true);
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to resolve rework');
    } finally { resolutionBusy = false; }
  }

  let filteredOrders = $derived($orders.filter(order => {
    if ($filter !== 'ALL' && order.stage?.state !== $filter) return false;
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return true;
    return [order.po_number, order.client, order.title, order.id]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(q));
  }));

  let queuedCount     = $derived($orders.filter(o => o.stage?.state === 'QUEUED').length);
  let inProgressCount = $derived($orders.filter(o => o.stage?.state === 'IN_PROGRESS').length);
  let blockedCount    = $derived($orders.filter(o => o.stage?.state === 'BLOCKED').length);
  let reworkCount     = $derived($orders.filter(o => o.stage?.state === 'REWORK').length);

  onMount(() => {
    const ownerId = $currentUser?.id;
    const lifetime = new AbortController();
    const isCurrent = () => !lifetime.signal.aborted && $currentUser?.id === ownerId;
    void (async () => {
      await loadStationOrders();
      if (!isCurrent()) return;

      unsubscribe = realtimeStore.subscribeToStation(station, () => {
        if (isCurrent()) void loadStationOrders(true);
      });

      refreshInterval = setInterval(() => {
        if (isCurrent() && !document.hidden && !completeModalOpen && !blockModalOpen &&
            !reworkModalOpen && !resolveModalOpen && !progressTarget && !packetTarget)
          void loadStationOrders(true);
      }, 30000);

      const confirmed = await ensureRoom({ id: stationRoomId, name: station }, lifetime.signal);
      if (confirmed && isCurrent()) await loadMessages(stationRoomId);
    })();

    return () => {
      lifetime.abort();
      unsubscribe?.();
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });
</script>

<svelte:head>
  <title>{station} — {$t('stationView.workstation')}</title>
</svelte:head>

<div class="station-board-page">
  <header class="station-header">
    <div class="header-content">
      <h1>{station} <span class="station-title-suffix">{$t('stationView.workstation')}</span></h1>
      <div class="header-stats">
        <div class="stat" class:active={inProgressCount > 0}>
          <span class="stat-value">{inProgressCount}</span>
          <span class="stat-label">{$t('stationView.in_progress')}</span>
        </div>
        <div class="stat" class:warning={queuedCount > 5}>
          <span class="stat-value">{queuedCount}</span>
          <span class="stat-label">{$t('stationView.queued')}</span>
        </div>
        <div class="stat" class:danger={blockedCount > 0}>
          <span class="stat-value">{blockedCount}</span>
          <span class="stat-label">{$t('stationView.blocked')}</span>
        </div>
        <div class="stat" class:warning={reworkCount > 0}>
          <span class="stat-value">{reworkCount}</span>
          <span class="stat-label">{$t('stationView.rework')}</span>
        </div>
      </div>
    </div>

    <div class="header-actions">
      <button class="btn btn-primary" onclick={() => $showScanner = true}>
        <Icon name="scan-line" size="sm" />
        {$t('stationView.scan_qr', { default: 'Scan QR' })}
      </button>
      <button class="btn btn-outline" onclick={() => showChat = !showChat} class:btn-active={showChat}>
        <Icon name="message-square" size="sm" />
        {$t('stationView.station_chat', { default: 'Station Chat' })}
      </button>
      <button class="btn btn-outline" onclick={() => loadStationOrders()} disabled={refreshing} aria-label={$t('stationView.refreshAria')}>
        <Icon name="refresh-cw" size="sm" />
        {refreshing ? $t('stationView.refreshing') : $t('common.refresh', { default: 'Refresh' })}
      </button>
    </div>
  </header>

  <div class="station-search">
    <label for="station-search-input">{$t('stationView.searchLabel')}</label>
    <div class="search-controls">
      <input id="station-search-input" type="search" bind:value={searchQuery}
        placeholder={$t('stationView.searchPlaceholder')} autocomplete="off" />
      {#if searchQuery}
        <button class="btn btn-outline" onclick={() => (searchQuery = '')} aria-label={$t('stationView.clearSearch')}>{$t('stationView.clear')}</button>
      {/if}
    </div>
  </div>

  <div class="filters" role="group" aria-label={$t('stationView.queueFilters')}>
    <button
      class="filter-btn"
      class:active={$filter === 'ALL'}
      aria-pressed={$filter === 'ALL'}
      onclick={() => $filter = 'ALL'}
    >
      {$t('stationView.all')} ({$orders.length})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'QUEUED'}
      aria-pressed={$filter === 'QUEUED'}
      onclick={() => $filter = 'QUEUED'}
    >
      {$t('stationView.queued')} ({queuedCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'IN_PROGRESS'}
      aria-pressed={$filter === 'IN_PROGRESS'}
      onclick={() => $filter = 'IN_PROGRESS'}
    >
      {$t('stationView.in_progress')} ({inProgressCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'BLOCKED'}
      aria-pressed={$filter === 'BLOCKED'}
      onclick={() => $filter = 'BLOCKED'}
    >
      {$t('stationView.blocked')} ({blockedCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'REWORK'}
      aria-pressed={$filter === 'REWORK'}
      onclick={() => $filter = 'REWORK'}
    >
      {$t('stationView.rework')} ({reworkCount})
    </button>
  </div>

  <div class="station-feedback" role="status" aria-live="polite">
    <span>{refreshing ? $t('stationView.refreshing') : lastUpdated ? $t('stationView.updated', { values: { time: lastUpdated } }) : ''}</span>
    {#if operationMessage}<span>{operationMessage}</span>{/if}
  </div>
  {#if !operatorCanAct}
    <p class="read-only-notice" role="note">{$t('stationView.readOnly', { values: { station } })}</p>
  {/if}
  {#if loadError}
    <div class="load-error" role="alert">
      <span>{loadError}{hasLoaded ? ` — ${$t('stationView.lastGood')}` : ''}</span>
      <button class="btn btn-outline" onclick={() => loadStationOrders()} disabled={refreshing}>{$t('common.retry')}</button>
    </div>
  {/if}
  {#if $loading}
    <div class="loading-state">
        <div class="spinner"></div>
      <p>{$t('stationView.loading')}</p>
    </div>
  {:else if !hasLoaded}
    <div class="empty-state">
      <h3>{$t('stationView.unavailable')}</h3>
      <p>{$t('stationView.retryHint')}</p>
      <button class="btn btn-primary" onclick={() => loadStationOrders()} disabled={refreshing}>Retry</button>
    </div>
  {:else if filteredOrders.length === 0}
    <div class="empty-state">
      <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <h3>{searchQuery ? $t('stationView.noSearchResults') : $t('stationView.emptyQueue')}</h3>
      <p>{searchQuery ? $t('stationView.searchHint') : $t('stationView.emptyHint')}</p>
      {#if searchQuery}<button class="btn btn-outline" onclick={() => (searchQuery = '')}>{$t('stationView.clearSearch')}</button>{/if}
    </div>
  {:else}
    <div class="orders-grid">
      {#each filteredOrders as order (order.id)}
        <article class="station-order-card">
          <div class="order-header">
            <div>
              <h3>{order.title || $t('productionPlanning.untitled')}</h3>
              <span class="po-number">{order.po_number}</span>
            </div>
            <SemanticBadge badge={priorityBadge(order.priority)} />
          </div>

          <div class="order-info">
            <div class="info-item">
              <span class="label">{$t('orderLists.headers.client')}:</span>
              <span class="value">{order.client}</span>
            </div>
            <div class="info-item">
              <span class="label">{$t('orderLists.headers.due')}:</span>
              <span class="value" class:overdue={isOrderOverdue(order.due_date, todayLocal)}>{dueDateLabel(order.due_date)}</span>
            </div>
            <div class="info-item">
              <span class="label">{$t('admin.users.table.status')}:</span>
              <SemanticBadge badge={stageBadge(order.stage?.state)} />
            </div>
          </div>
          <OrderBadges {order} lifecycle={false} priority={false} flags={false} />

          {#if order.stage?.state==='BLOCKED'||order.stage?.state==='REWORK'}
            <div class="blocked-notice" role="status">
              <strong>{$t('productionPacket.held')}</strong>
              {#if order.stage?.blocked_reason}
                <p>{order.stage.blocked_reason}</p>
              {/if}
            </div>
          {/if}

          {#if order.stage?.notes}
            <div class="stage-notes">
              <strong>{$t('stationView.notes')}:</strong> {order.stage.notes}
            </div>
          {/if}

          <div class="order-actions">
            {#if order.stage?.state === 'QUEUED'}
              <button class="btn btn-sm btn-success" onclick={() => startOrder(order.id)} disabled={!operatorCanAct || workingOnOrderId !== null}>
                <Icon name="play" size="sm" />
                {$t('stationView.start', { default: 'Start' })}
              </button>
            {/if}

            {#if order.stage?.state === 'IN_PROGRESS'}
              <button class="btn btn-sm btn-success" onclick={() => completeOrder(order.id)} disabled={!operatorCanAct || workingOnOrderId !== null}>
                <Icon name="check" size="sm" />
                {$t('stationView.complete', { default: 'Complete' })}
              </button>
              <button class="btn btn-sm btn-outline" onclick={() => openProgress(order.id)}
                disabled={!operatorCanAct || workingOnOrderId !== null}>
                <Icon name="clipboard-list" size="sm" />
                {$t('productionFloor.logProgress')}
              </button>
              <button class="btn btn-sm btn-warning" onclick={() => openReworkModal(order.id)} disabled={!operatorCanAct || workingOnOrderId !== null}>
                <Icon name="rotate-ccw" size="sm" />
                {$t('stationView.rework', { default: 'Rework' })}
              </button>
              <button class="btn btn-sm btn-danger" onclick={() => openBlockModal(order.id)} disabled={!operatorCanAct || workingOnOrderId !== null}>
                <Icon name="ban" size="sm" />
                {$t('stationView.block', { default: 'Block' })}
              </button>
            {/if}

            {#if order.stage?.state === 'BLOCKED'}
              <button class="btn btn-sm btn-primary" onclick={() => updateStageState(order.id, 'IN_PROGRESS')} disabled={!operatorCanAct || workingOnOrderId !== null}>
                <Icon name="play" size="sm" />
                {$t('stationView.resume', { default: 'Resume' })}
              </button>
            {/if}

            {#if order.stage?.state === 'REWORK'}
              <button class="btn btn-sm btn-warning" onclick={() => openResolveRework(order.id)} disabled={!operatorCanAct || workingOnOrderId !== null}>
                <Icon name="check-circle" size="sm" />
                Resolve rework
              </button>
            {/if}

            <button type="button" class="btn btn-sm btn-outline"
              onclick={()=>packetTarget=order}>
              <Icon name="file" size="sm" />
              {$t('productionPacket.open')}
            </button>
            <a href={`/orders/${encodeURIComponent(order.id)}`} class="btn btn-sm btn-outline">
              <Icon name="eye" size="sm" />
              {$t('common.details', { default: 'Details' })}
            </a>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

{#if $showScanner}
  <QRScanner bind:open={$showScanner} onscan={handleQRScan} />
{/if}

{#if packetTarget}
  <dialog class="modal-overlay" aria-label={$t('productionPacket.title')}
    use:modalDialog={{ onClose: () => { packetTarget = null; } }}>
    <div class="modal-content production-packet-modal">
      {#key packetTarget.id}
        <StationProductionPacket orderId={packetTarget.id} {station}
          onClose={()=>packetTarget=null}/>
      {/key}
    </div>
  </dialog>
{/if}

{#if progressTarget}
  <dialog class="modal-overlay" aria-label={$t('productionFloor.title')}
    use:modalDialog={{ onClose: () => { if (!progressBusy) progressTarget = null; }, closeOnEscape: !progressBusy, closeOnBackdrop: !progressBusy }}>
    <div class="modal-content">
      <StationProgressPanel orderId={progressTarget.id} {station} bind:busy={progressBusy}
        expectedUpdatedAt={progressTarget.stage.updated_at}
        onClose={() => (progressTarget=null)}
        onSaved={() => {operationMessage=$t('productionFloor.saved');void loadStationOrders(true);}} />
    </div>
  </dialog>
{/if}

<StationCompleteModal
  bind:open={completeModalOpen}
  station={station}
  orderRef={completeTarget?.po_number ?? completeTarget?.id ?? ''}
  onComplete={submitCompletion}
  onSubmitted={onCompletionSubmitted}
/>

<!-- Station Chat Panel -->
{#if showChat}
  <div class="station-chat-overlay" role="complementary" aria-label="{station} station chat">
    <div class="station-chat-panel">
      <div class="station-chat-panel__header">
        <span class="station-chat-panel__title">
          <Icon name="message-square" size="sm" />
          {station} — {$t('stationView.station_chat', { default: 'Station Chat' })}
        </span>
        <button class="station-chat-panel__close" onclick={() => showChat = false} aria-label={$t('common.close', { default: 'Close' })}>
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div class="station-chat-panel__body">
        <ChatPane />
      </div>
    </div>
  </div>
{/if}

<!-- Block Order Modal -->
{#if blockModalOpen}
  <dialog class="modal-overlay" aria-labelledby="block-modal-title"
    use:modalDialog={{ onClose: () => { if (!workingOnOrderId) blockModalOpen = false; }, closeOnEscape: workingOnOrderId === null, closeOnBackdrop: workingOnOrderId === null }}>
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="block-modal-title">{$t('stationView.block_order', { default: 'Block Order' })}</h2>
        <button class="close-btn" disabled={workingOnOrderId !== null} onclick={() => blockModalOpen = false} aria-label={$t('common.close', { default: 'Close' })}>
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div class="modal-body">
        <label class="modal-label">
          {$t('stationView.block_reason_label', { default: 'Reason for blocking' })}
          <textarea
            class="modal-textarea"
            bind:value={blockReason} disabled={workingOnOrderId !== null}
            rows="3"
            placeholder={$t('stationView.block_reason_placeholder', { default: 'Describe why this order is blocked…' })}
          ></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" disabled={workingOnOrderId !== null} onclick={() => blockModalOpen = false}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </button>
        <button class="btn btn-danger" onclick={submitBlock} disabled={!blockReason.trim() || workingOnOrderId !== null}>
          <Icon name="ban" size="sm" />
          {$t('stationView.confirm_block', { default: 'Block Order' })}
        </button>
      </div>
    </div>
  </dialog>
{/if}

<!-- Rework Request Modal -->
{#if reworkModalOpen}
  <dialog class="modal-overlay" aria-labelledby="rework-modal-title"
    use:modalDialog={{ onClose: () => { if (!workingOnOrderId) reworkModalOpen = false; }, closeOnEscape: workingOnOrderId === null, closeOnBackdrop: workingOnOrderId === null }}>
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="rework-modal-title">{$t('stationView.request_rework', { default: 'Request Rework' })}</h2>
        <button class="close-btn" disabled={workingOnOrderId !== null} onclick={() => reworkModalOpen = false} aria-label={$t('common.close', { default: 'Close' })}>
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div class="modal-body">
        <label class="modal-label">
          {$t('stationView.rework_reason_label', { default: 'Rework reason' })}
          <select class="modal-select" bind:value={reworkReason} disabled={workingOnOrderId !== null}>
            {#each REWORK_REASONS as r}
              <option value={r}>{r}</option>
            {/each}
          </select>
        </label>
        <label class="modal-label">
          {$t('stationView.rework_description_label', { default: 'Describe the issue' })}
          <textarea
            class="modal-textarea"
            bind:value={reworkDescription} disabled={workingOnOrderId !== null}
            rows="3"
            placeholder={$t('stationView.rework_description_placeholder', { default: 'What needs to be redone and why…' })}
          ></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" disabled={workingOnOrderId !== null} onclick={() => reworkModalOpen = false}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </button>
        <button class="btn btn-warning" onclick={submitRework} disabled={!reworkDescription.trim() || workingOnOrderId !== null}>
          <Icon name="rotate-ccw" size="sm" />
          {$t('stationView.confirm_rework', { default: 'Submit Rework' })}
        </button>
      </div>
    </div>
  </dialog>
{/if}

<!-- Resolving rework changes the cycle and stage together via the R02 RPC. -->
{#if resolveModalOpen}
  <dialog class="modal-overlay" aria-labelledby="resolve-rework-title"
    use:modalDialog={{ onClose: () => { if (!resolutionBusy) resolveModalOpen = false; }, closeOnEscape: !resolutionBusy, closeOnBackdrop: false }}>
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="resolve-rework-title">{$t('stationView.resolveTitle')}</h2>
        <button class="close-btn" onclick={() => resolveModalOpen = false}
          disabled={resolutionBusy} aria-label={$t('common.close')}>×</button>
      </div>
      <div class="modal-body">
        <p>{$t('stationView.resolveHelp', { values: { station } })}</p>
        <label class="modal-label">
          {$t('stationView.resolveNotes')}
          <textarea class="modal-textarea" bind:value={resolutionNotes} rows="4" required disabled={resolutionBusy}
            placeholder={$t('stationView.resolvePlaceholder')}></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick={() => resolveModalOpen = false} disabled={resolutionBusy}>{$t('common.cancel')}</button>
        <button class="btn btn-success" onclick={submitResolution} disabled={!resolutionNotes.trim() || resolutionBusy}>
          {resolutionBusy ? $t('stationView.saving') : $t('stationView.confirmResolution')}
        </button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .station-board-page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 1600px;
    margin: 0 auto;
  }

  .station-header {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .header-content h1 {
    margin: 0 0 1rem 0;
    color: var(--text);
    font-size: 2rem;
  }

  .header-stats {
    display: flex;
    gap: 2rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    background: var(--bg-0);
    border: 2px solid var(--border);
    border-radius: 8px;
    min-width: 100px;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .stat.active {
    border-color: var(--brand);
    background: color-mix(in oklab, var(--brand) 10%, transparent);
  }

  .stat.warning {
    border-color: var(--warn);
    background: color-mix(in oklab, var(--warn) 10%, transparent);
  }

  .stat.danger {
    border-color: var(--error);
    background: color-mix(in oklab, var(--error) 10%, transparent);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text);
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .header-actions {
    display: flex;
    gap: 1rem;
  }

  .filters {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-btn {
    padding: 0.75rem 1.25rem;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .filter-btn:hover {
    background: var(--bg-2);
    border-color: var(--accent-1);
  }

  .filter-btn.active {
    background: var(--accent-1);
    color: var(--bg-0);
    border-color: var(--accent-1);
  }

  .orders-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .station-order-card {
    background: var(--bg-1);
    border: 2px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .station-order-card:hover {
    border-color: var(--accent-1);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 10%, transparent);
  }

  .order-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .order-header h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .po-number {
    font-size: 0.875rem;
    color: var(--muted);
    font-family: 'Courier New', monospace;
  }

  .order-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
  }

  .info-item .label {
    color: var(--muted);
    font-weight: 600;
  }

  .info-item .value {
    color: var(--text);
  }

  .blocked-notice,
  .stage-notes {
    padding: 0.75rem;
    background: color-mix(in oklab, var(--error) 10%, transparent);
    border-left: 3px solid var(--danger);
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .stage-notes {
    background: color-mix(in oklab, var(--brand) 10%, transparent);
    border-left-color: var(--brand);
  }

  .order-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px color-mix(in oklab, var(--bg-0) 15%, transparent);
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  .btn-primary {
    background: var(--brand);
    color: var(--bg-0);
  }

  .btn-success {
    background: var(--ok);
    color: var(--bg-0);
  }

  .btn-warning {
    background: var(--warn);
    color: black;
  }

  .btn-danger {
    background: var(--error);
    color: var(--bg-0);
  }

  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
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

  .empty-icon {
    color: var(--muted);
    margin-bottom: 1rem;
  }

  .empty-state h3 {
    margin: 0.5rem 0;
    color: var(--text);
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: oklch(0% 0 0 / 70%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg-1);
    border-radius: 8px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    color: var(--text);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .close-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
  }

  .modal-textarea,
  .modal-select {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-0);
    color: var(--text);
    font-size: 0.875rem;
    font-family: inherit;
    resize: vertical;
  }
  .modal-textarea:focus,
  .modal-select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: var(--focus-ring);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
  }

  .btn-active {
    background: var(--brand-soft);
    color: var(--brand);
    border-color: var(--brand);
  }

  /* Station chat panel */
  .station-chat-overlay {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-modal) - 1);
    pointer-events: none;
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
  }

  .station-chat-panel {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    width: min(420px, 100vw);
    height: 100%;
    background: var(--bg-1);
    border-left: 1px solid var(--border);
    box-shadow: var(--glass-shadow-lg);
    animation: rf-slide-right var(--motion-md) var(--ease-emphasized) both;
  }

  @keyframes rf-slide-right {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }

  .station-chat-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
    flex-shrink: 0;
  }

  .station-chat-panel__title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text);
  }

  .station-chat-panel__close {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .station-chat-panel__close:hover { background: var(--bg-0); }

  .station-chat-panel__body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 768px) {
    .station-board-page {
      padding: 1rem;
    }

    .station-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-stats {
      flex-wrap: wrap;
      gap: 1rem;
    }

    .stat {
      flex: 1;
      min-width: 80px;
    }

    .orders-grid {
      grid-template-columns: 1fr;
    }
  }

  .station-feedback {
    display: flex; flex-wrap: wrap; justify-content: space-between;
    gap: .5rem; color: var(--muted); font-size: .8rem; min-height: 1.25rem;
  }
  .read-only-notice, .load-error {
    padding: .85rem 1rem; margin: 0; border: 1px solid var(--border);
    border-radius: .7rem; background: var(--bg-1); color: var(--text); font-size: .9rem;
  }
  .load-error { border-color: var(--error); display: flex; justify-content: space-between; gap: .75rem; align-items: center; flex-wrap: wrap; }
  .info-item .overdue { color: var(--error); font-weight: 750; }

  .btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
  .filter-btn:focus-visible, .btn:focus-visible, .close-btn:focus-visible, .order-actions a:focus-visible {
    outline: 3px solid var(--brand); outline-offset: 3px;
  }
  .order-actions .btn, .header-actions .btn { min-height: 44px; justify-content: center; }
  @media (max-width: 540px) {
    .station-board-page { padding: .75rem; gap: 1rem; }
    .station-header, .station-order-card { padding: 1rem; border-radius: .75rem; }
    .header-content h1 { font-size: 1.5rem; }
    .header-stats { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: .5rem; }
    .stat { min-width: 0; padding: .65rem; }
    .header-actions { flex-wrap: wrap; width: 100%; }
    .header-actions .btn { flex: 1 1 130px; }
    .filters { flex-wrap: nowrap; overflow-x: auto; padding-bottom: .4rem; scroll-snap-type: x proximity; }
    .filter-btn { min-height: 44px; flex: 0 0 auto; scroll-snap-align: start; }
    .order-actions .btn { flex: 1 1 140px; }
    .orders-grid { grid-template-columns: minmax(0,1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner, .station-chat-panel { animation: none; }
    .btn, .station-order-card { transition: none; }
  }

  .production-packet-modal{width:min(1100px,95vw);max-height:94vh;overflow:auto}
  .station-search { display: flex; flex-direction: column; gap: .35rem; max-width: 550px; }
  .station-search label { font-size: .78rem; font-weight: 650; color: var(--muted); }
  .search-controls { display: flex; gap: .45rem; }
  .station-search input {
    width: 100%; min-height: 44px; padding: .65rem .8rem;
    border-radius: .6rem; color: var(--text); background: var(--bg-1);
    border: 1px solid var(--border); font: inherit;
  }
  .station-search input:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }

  /* OMS LUMIGRID — workshop screens prioritize legibility and action safety. */
  .station-board-page {padding:var(--space-lg) 0 var(--space-2xl);gap:var(--space-lg);width:100%;}
  .station-header {position:relative;background:var(--glass-bg-strong);border:1px solid var(--glass-border);
    border-radius:var(--radius-lg);padding:var(--space-xl);gap:var(--space-lg);}
  .station-header::before {content:'';position:absolute;left:0;top:0;width:92px;height:2px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  .header-content {min-width:0;flex:1;}
  .header-content h1 {font-size:clamp(1.6rem,2.7vw,2.2rem);letter-spacing:var(--tracking-tight);
    line-height:1.2;margin:0 0 var(--space-lg);}
  .station-title-suffix {font-weight:500;color:var(--ink-secondary);}
  .header-stats {display:grid;grid-template-columns:repeat(4,minmax(105px,1fr));
    gap:var(--space-sm);max-width:670px;}
  .stat {align-items:flex-start;background:var(--bg-1);border:1px solid var(--border);
    border-radius:var(--radius-md);padding:var(--space-md);gap:var(--space-xs);min-width:0;}
  .stat.active {border-color:color-mix(in oklab,var(--brand) 30%,var(--border));background:var(--bg-1);}
  .stat.warning {border-color:color-mix(in oklab,var(--warn) 38%,var(--border));background:var(--bg-1);}
  .stat.danger {border-color:color-mix(in oklab,var(--error) 48%,var(--border));background:var(--bg-1);}
  .stat-value {font-size:clamp(1.35rem,2vw,1.75rem);line-height:1;font-variant-numeric:tabular-nums;}
  .stat.danger .stat-value {color:var(--error);}
  .stat.warning .stat-value {color:var(--warn);}
  .stat-label {font-size:var(--text-xs);letter-spacing:.04em;text-transform:none;}
  .header-actions {flex-wrap:wrap;gap:var(--space-sm);}
  .btn {min-height:42px;border-radius:var(--radius-sm);box-shadow:none;justify-content:center;}
  .btn-primary {color:var(--on-brand);}
  .btn-primary:hover:not(:disabled) {background:var(--brand-2);}
  .btn-outline {color:var(--ink-primary);background:var(--bg-1);}
  .btn-success {color:#061609;}
  .btn-warning {color:#1a1103;}
  .btn-danger {color:#1a0707;}
  .filters {flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;
    padding:var(--space-xs);border:1px solid var(--border);border-radius:var(--radius-md);
    background:var(--bg-1);gap:var(--space-xs);}
  .filter-btn {flex:0 0 auto;border-radius:var(--radius-sm);min-height:42px;padding:9px 14px;
    color:var(--ink-secondary);}
  .filter-btn.active {color:var(--brand);background:var(--brand-soft);
    border-color:color-mix(in oklab,var(--brand) 38%,var(--border));}
  .station-search {max-width:720px;}
  .station-search input {background:var(--bg-1);border-radius:var(--radius-sm);}
  .orders-grid {grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:var(--space-md);}
  .station-order-card {background:var(--glass-bg-strong);border:1px solid var(--glass-border);
    border-radius:var(--radius-lg);padding:var(--space-lg);gap:var(--space-md);
    box-shadow:var(--glass-shadow-sm);}
  .station-order-card:hover {border-color:color-mix(in oklab,var(--brand) 35%,var(--border));
    box-shadow:var(--elevation-1);}
  .order-header h3 {font-size:var(--text-lg);overflow-wrap:anywhere;}
  .po-number {font-family:var(--font-mono,monospace);font-variant-numeric:tabular-nums;}

  .order-info {gap:var(--space-sm);}
  .info-item {gap:var(--space-md);}
  .info-item .value {text-align:right;overflow-wrap:anywhere;max-width:65%;}

  .blocked-notice {color:var(--ink-primary);background:var(--error-soft);border-color:var(--error);}
  .stage-notes {color:var(--ink-primary);background:var(--bg-2);border-color:var(--brand);}
  .order-actions {gap:var(--space-sm);}
  .order-actions .btn {flex:1 1 140px;min-width:0;}
  .modal-content {border:1px solid var(--border);border-radius:var(--radius-lg);}
  .modal-footer {flex-wrap:wrap;}
  .modal-textarea:focus-visible,.modal-select:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
  .read-only-notice {border-color:var(--border-strong);background:var(--bg-2);}
  @media(max-width:850px) {.station-header {align-items:stretch;}.header-stats {max-width:none;}}
  @media(max-width:560px) {
    .station-board-page {padding:var(--space-sm) 0 var(--space-xl);}
    .station-header {padding:var(--space-lg);}
    .header-stats {grid-template-columns:repeat(2,minmax(0,1fr));}
    .orders-grid {grid-template-columns:minmax(0,1fr);}
    .filters {scroll-snap-type:x proximity;}
    .filter-btn {scroll-snap-align:start;}
  }
  @media(prefers-reduced-transparency:reduce) {
    .station-header,.station-order-card {background:var(--bg-1);}
  }

  dialog.modal-overlay { margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;color:inherit;box-sizing:border-box; }
  dialog.modal-overlay:not([open]) { display:none; }
  dialog.modal-overlay::backdrop { background:transparent; }
</style>
