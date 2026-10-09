<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { canOperateStation } from '$lib/order/lifecycle-guards';
  import { priorityLabel, dueDateLabel, stageStateLabel, isOrderOverdue } from '$lib/order/operator-ui';
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import { realtimeStore } from '$lib/stores/realtime';
  import QRScanner from '$lib/components/qr/QRScanner.svelte';
  import StationCompleteModal from '$lib/components/station/StationCompleteModal.svelte';
  import { notifications } from '$lib/notify/store';
  import { ensureRoom, loadMessages } from '$lib/chat/chat-store';
  import ChatPane from '$lib/ui/ChatPane.svelte';
  import Icon from '$lib/ui/Icon.svelte';

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
  let todayLocal = new Date().toLocaleDateString('sv-SE');

  let completeModalOpen = $state(false);
  let completeTarget = $state<StationOrder | null>(null);
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
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/stages?station=${encodeURIComponent(station)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, ...extras })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? body?.error ?? `Stage change rejected (HTTP ${response.status})`);
      operationMessage = `${station}: ${stageStateLabel(state)} saved`;
      await loadStationOrders(true);
      return true;
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Stage update failed');
      return false;
    } finally { workingOnOrderId = null; }
  }

  async function handleQRScan(data: string) {
    if (!data.startsWith('ORDER:')) { notifications.error('Unrecognized OMS QR code'); return; }
    const id = data.slice('ORDER:'.length).trim();
    if (!id) return;
    // Scan identifies an order. Starting production remains an explicit action.
    $showScanner = false;
    await goto(`/orders/${encodeURIComponent(id)}`);
  }

  async function startOrder(id: string) {
    await updateStageState(id, 'IN_PROGRESS');
  }

  function completeOrder(orderId: string) {
    const target = $orders.find((o) => o.id === orderId);
    if (!target) return;
    completeTarget = target;
    completeModalOpen = true;
  }

  async function submitCompletion(
    items: Array<{ item_id: string; quantity: number }>,
    opts: { skipped: boolean; skipReason: string | null },
  ) {
    if (!completeTarget) return { ok: false, error: 'No target' };
    try {
      const res = await fetch(
        `/api/orders/${completeTarget.id}/stages/${station}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, skipped: opts.skipped, skipReason: opts.skipReason }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: payload?.error ?? `HTTP ${res.status}` };
      return { ok: true, consumed: payload?.consumed ?? 0, lowStock: payload?.lowStock ?? [] };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Network error' };
    }
  }

  function onCompletionSubmitted(p: { consumed: number; skipped: boolean; lowStock: any[] }) {
    completeTarget = null;
    if (p.lowStock.length > 0) {
      const skus = p.lowStock.map((h: any) => h.sku || h.name).join(', ');
      notifications.warning(
        $t('stationView.low_stock_warning', { default: `Low stock: ${skus}. HoP has been notified.`, values: { skus } })
      );
    }
    loadStationOrders();
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

  onMount(async () => {
    await loadStationOrders();

    unsubscribe = realtimeStore.subscribeToStation(station, () => {
      void loadStationOrders(true);
    });

    refreshInterval = setInterval(() => {
      if (!document.hidden && !completeModalOpen && !blockModalOpen &&
          !reworkModalOpen && !resolveModalOpen) void loadStationOrders(true);
    }, 30000);

    // Ensure this station's chat room exists and load its messages
    await ensureRoom({ id: stationRoomId, name: station });
    await loadMessages(stationRoomId);
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
    if (refreshInterval) clearInterval(refreshInterval);
  });
</script>

<svelte:head>
  <title>{station} Station Board - OMS</title>
</svelte:head>

<div class="station-board-page">
  <header class="station-header">
    <div class="header-content">
      <h1>{station} Station</h1>
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
      <button class="btn btn-outline" onclick={() => loadStationOrders()} disabled={refreshing} aria-label="Refresh station orders">
        <Icon name="refresh-cw" size="sm" />
        {refreshing ? 'Refreshing…' : $t('common.refresh', { default: 'Refresh' })}
      </button>
    </div>
  </header>

  <div class="station-search">
    <label for="station-search-input">Find order by PO, client or title</label>
    <div class="search-controls">
      <input id="station-search-input" type="search" bind:value={searchQuery}
        placeholder="Search this workstation…" autocomplete="off" />
      {#if searchQuery}
        <button class="btn btn-outline" onclick={() => (searchQuery = '')} aria-label="Clear order search">Clear</button>
      {/if}
    </div>
  </div>

  <div class="filters" role="group" aria-label="Station queue filters">
    <button
      class="filter-btn"
      class:active={$filter === 'ALL'}
      aria-pressed={$filter === 'ALL'}
      onclick={() => $filter = 'ALL'}
    >
      All ({$orders.length})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'QUEUED'}
      aria-pressed={$filter === 'QUEUED'}
      onclick={() => $filter = 'QUEUED'}
    >
      Queued ({queuedCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'IN_PROGRESS'}
      aria-pressed={$filter === 'IN_PROGRESS'}
      onclick={() => $filter = 'IN_PROGRESS'}
    >
      In Progress ({inProgressCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'BLOCKED'}
      aria-pressed={$filter === 'BLOCKED'}
      onclick={() => $filter = 'BLOCKED'}
    >
      Blocked ({blockedCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'REWORK'}
      aria-pressed={$filter === 'REWORK'}
      onclick={() => $filter = 'REWORK'}
    >
      Rework ({reworkCount})
    </button>
  </div>

  <div class="station-feedback" role="status" aria-live="polite">
    <span>{refreshing ? 'Refreshing station…' : lastUpdated ? `Updated ${lastUpdated}` : ''}</span>
    {#if operationMessage}<span>{operationMessage}</span>{/if}
  </div>
  {#if !operatorCanAct}
    <p class="read-only-notice" role="note">View only. You are not assigned to operate {station}.</p>
  {/if}
  {#if loadError}
    <div class="load-error" role="alert">
      <span>{loadError}{hasLoaded ? ' — showing the last successful list.' : ''}</span>
      <button class="btn btn-outline" onclick={() => loadStationOrders()} disabled={refreshing}>Retry</button>
    </div>
  {/if}
  {#if $loading}
    <div class="loading-state">
        <div class="spinner"></div>
      <p>Loading station orders…</p>
    </div>
  {:else if !hasLoaded}
    <div class="empty-state">
      <h3>Station data unavailable</h3>
      <p>Check the connection and retry.</p>
      <button class="btn btn-primary" onclick={() => loadStationOrders()} disabled={refreshing}>Retry</button>
    </div>
  {:else if filteredOrders.length === 0}
    <div class="empty-state">
      <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <h3>{searchQuery ? 'No orders match your search' : 'No orders in this queue'}</h3>
      <p>{searchQuery ? 'Try another PO, client or title.' : 'Orders will appear here when they reach this station.'}</p>
      {#if searchQuery}<button class="btn btn-outline" onclick={() => (searchQuery = '')}>Clear search</button>{/if}
    </div>
  {:else}
    <div class="orders-grid">
      {#each filteredOrders as order (order.id)}
        <article class="station-order-card">
          <div class="order-header">
            <div>
              <h3>{order.title || 'Untitled order'}</h3>
              <span class="po-number">{order.po_number}</span>
            </div>
            <span class="priority-badge" class:urgent={['HIGH','URGENT','CRITICAL'].includes(String(order.priority ?? '').toUpperCase())}>
              {priorityLabel(order.priority)}
            </span>
          </div>

          <div class="order-info">
            <div class="info-item">
              <span class="label">Client:</span>
              <span class="value">{order.client}</span>
            </div>
            <div class="info-item">
              <span class="label">Due:</span>
              <span class="value" class:overdue={isOrderOverdue(order.due_date, todayLocal)}>{dueDateLabel(order.due_date)}</span>
            </div>
            <div class="info-item">
              <span class="label">Status:</span>
              <span class="status-badge status-{order.stage?.state?.toLowerCase()}">
                {stageStateLabel(order.stage?.state)}
              </span>
            </div>
          </div>

          {#if order.stage?.blocked_reason}
            <div class="blocked-notice">
              <strong>🔴 Blocked:</strong> {order.stage.blocked_reason}
            </div>
          {/if}

          {#if order.stage?.notes}
            <div class="stage-notes">
              <strong>Notes:</strong> {order.stage.notes}
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
  <div
    class="modal-overlay"
    onclick={() => $showScanner = false}
    onkeydown={(e) => e.key === 'Escape' && ($showScanner = false)}
    role="button"
    tabindex="0"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-title"
    >
      <div class="modal-header">
        <h2 id="scanner-title">{$t('stationView.scan_qr')}</h2>
        <button class="close-btn" onclick={() => $showScanner = false} aria-label={$t('common.close')}>×</button>
      </div>
      <QRScanner onscan={(data) => handleQRScan(data)} />
    </div>
  </div>
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
  <div
    class="modal-overlay"
    onclick={() => blockModalOpen = false}
    onkeydown={(e) => e.key === 'Escape' && (blockModalOpen = false)}
    role="button"
    tabindex="0"
    aria-label={$t('common.close', { default: 'Close' })}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-modal-title"
    >
      <div class="modal-header">
        <h2 id="block-modal-title">{$t('stationView.block_order', { default: 'Block Order' })}</h2>
        <button class="close-btn" onclick={() => blockModalOpen = false} aria-label={$t('common.close', { default: 'Close' })}>
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div class="modal-body">
        <label class="modal-label">
          {$t('stationView.block_reason_label', { default: 'Reason for blocking' })}
          <textarea
            class="modal-textarea"
            bind:value={blockReason}
            rows="3"
            placeholder={$t('stationView.block_reason_placeholder', { default: 'Describe why this order is blocked…' })}
          ></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick={() => blockModalOpen = false}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </button>
        <button class="btn btn-danger" onclick={submitBlock} disabled={!blockReason.trim() || workingOnOrderId !== null}>
          <Icon name="ban" size="sm" />
          {$t('stationView.confirm_block', { default: 'Block Order' })}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Rework Request Modal -->
{#if reworkModalOpen}
  <div
    class="modal-overlay"
    onclick={() => reworkModalOpen = false}
    onkeydown={(e) => e.key === 'Escape' && (reworkModalOpen = false)}
    role="button"
    tabindex="0"
    aria-label={$t('common.close', { default: 'Close' })}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rework-modal-title"
    >
      <div class="modal-header">
        <h2 id="rework-modal-title">{$t('stationView.request_rework', { default: 'Request Rework' })}</h2>
        <button class="close-btn" onclick={() => reworkModalOpen = false} aria-label={$t('common.close', { default: 'Close' })}>
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div class="modal-body">
        <label class="modal-label">
          {$t('stationView.rework_reason_label', { default: 'Rework reason' })}
          <select class="modal-select" bind:value={reworkReason}>
            {#each REWORK_REASONS as r}
              <option value={r}>{r}</option>
            {/each}
          </select>
        </label>
        <label class="modal-label">
          {$t('stationView.rework_description_label', { default: 'Describe the issue' })}
          <textarea
            class="modal-textarea"
            bind:value={reworkDescription}
            rows="3"
            placeholder={$t('stationView.rework_description_placeholder', { default: 'What needs to be redone and why…' })}
          ></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick={() => reworkModalOpen = false}>
          {$t('actions.cancel', { default: 'Cancel' })}
        </button>
        <button class="btn btn-warning" onclick={submitRework} disabled={!reworkDescription.trim() || workingOnOrderId !== null}>
          <Icon name="rotate-ccw" size="sm" />
          {$t('stationView.confirm_rework', { default: 'Submit Rework' })}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Resolving rework changes the cycle and stage together via the R02 RPC. -->
{#if resolveModalOpen}
  <div class="modal-overlay" role="presentation">
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="resolve-rework-title"
      onkeydown={(event) => { if (event.key === 'Escape' && !resolutionBusy) resolveModalOpen = false; }}
      tabindex="-1">
      <div class="modal-header">
        <h2 id="resolve-rework-title">Resolve rework</h2>
        <button class="close-btn" onclick={() => resolveModalOpen = false}
          disabled={resolutionBusy} aria-label="Close resolution dialog">×</button>
      </div>
      <div class="modal-body">
        <p>Describe what was fixed. This returns {station} to In Progress; it does not mark the stage complete.</p>
        <label class="modal-label">
          Resolution notes (required)
          <textarea class="modal-textarea" bind:value={resolutionNotes} rows="4" required
            placeholder="Describe the repair, inspection and acceptance…"></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick={() => resolveModalOpen = false} disabled={resolutionBusy}>Cancel</button>
        <button class="btn btn-success" onclick={submitResolution} disabled={!resolutionNotes.trim() || resolutionBusy}>
          {resolutionBusy ? 'Saving…' : 'Confirm resolution'}
        </button>
      </div>
    </div>
  </div>
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

  .priority-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--warn);
    color: var(--bg-0);
  }

  .priority-badge.priority-8,
  .priority-badge.priority-9,
  .priority-badge.priority-10 {
    background: var(--danger);
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

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-queued { background: var(--link, var(--brand)); color: white; }
  .status-in_progress { background: var(--brand); color: white; }
  .status-blocked { background: var(--error); color: white; }
  .status-rework { background: var(--warn); color: black; }
  .status-completed { background: var(--ok); color: white; }
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

  .icon {
    flex-shrink: 0;
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
  .priority-badge.urgent { background: var(--error); }
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

  .station-search { display: flex; flex-direction: column; gap: .35rem; max-width: 550px; }
  .station-search label { font-size: .78rem; font-weight: 650; color: var(--muted); }
  .search-controls { display: flex; gap: .45rem; }
  .station-search input {
    width: 100%; min-height: 44px; padding: .65rem .8rem;
    border-radius: .6rem; color: var(--text); background: var(--bg-1);
    border: 1px solid var(--border); font: inherit;
  }
  .station-search input:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
</style>
