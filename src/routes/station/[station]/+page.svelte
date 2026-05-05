<script lang="ts">
  import { page } from '$app/state';
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
    priority: number;
    due_date: string;
  }

  const orders = writable<StationOrder[]>([]);
  const loading = writable(true);
  const filter = writable<'ALL' | 'QUEUED' | 'IN_PROGRESS' | 'BLOCKED' | 'REWORK'>('ALL');
  const showScanner = writable(false);

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
  const REWORK_REASONS = ['RECUT', 'REPAINT', 'REWELD', 'REPRINT', 'QUALITY', 'OTHER'];

  let unsubscribe: (() => void) | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function loadStationOrders() {
    $loading = true;
    try {
      const response = await fetch(`/api/station/${station}/orders`);
      if (!response.ok) throw new Error('Failed to load orders');
      $orders = await response.json();
    } catch (err) {
      console.error('Failed to load station orders:', err);
      notifications.error($t('stationView.load_error', { default: 'Failed to load station orders' }));
    } finally {
      $loading = false;
    }
  }

  async function updateStageState(orderId: string, newState: string) {
    try {
      const response = await fetch(`/api/orders/${orderId}/stages?station=${station}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });
      if (!response.ok) throw new Error('Failed to update stage');
      await loadStationOrders();
    } catch (err: any) {
      notifications.error(err.message ?? $t('stationView.update_error', { default: 'Failed to update stage' }));
    }
  }

  async function handleQRScan(qrData: string) {
    if (qrData.startsWith('ORDER:')) {
      const orderId = qrData.replace('ORDER:', '');
      await updateStageState(orderId, 'IN_PROGRESS');
      $showScanner = false;
    }
  }

  async function startOrder(orderId: string) {
    await updateStageState(orderId, 'IN_PROGRESS');
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
    blockModalOpen = false;
    try {
      const res = await fetch(`/api/orders/${blockTargetId}/stages?station=${station}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'BLOCKED', blocked_reason: blockReason })
      });
      if (!res.ok) throw new Error('Failed to block order');
      notifications.info($t('stationView.order_blocked', { default: 'Order blocked' }));
      await loadStationOrders();
    } catch (err) {
      notifications.error($t('stationView.block_error', { default: 'Failed to block order' }));
    }
  }

  function openReworkModal(orderId: string) {
    reworkTargetId = orderId;
    reworkReason = 'RECUT';
    reworkDescription = '';
    reworkModalOpen = true;
  }

  async function submitRework() {
    if (!reworkDescription.trim()) return;
    reworkModalOpen = false;
    try {
      const res = await fetch(`/api/orders/${reworkTargetId}/rework`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station, reason: reworkReason, description: reworkDescription })
      });
      if (!res.ok) throw new Error('Failed to create rework request');
      notifications.info($t('stationView.rework_created', { default: 'Rework request created' }));
      await loadStationOrders();
    } catch (err) {
      notifications.error($t('stationView.rework_error', { default: 'Failed to create rework request' }));
    }
  }

  let filteredOrders = $derived($orders.filter(order => {
    if ($filter === 'ALL') return true;
    return order.stage?.state === $filter;
  }));

  let queuedCount     = $derived($orders.filter(o => o.stage?.state === 'QUEUED').length);
  let inProgressCount = $derived($orders.filter(o => o.stage?.state === 'IN_PROGRESS').length);
  let blockedCount    = $derived($orders.filter(o => o.stage?.state === 'BLOCKED').length);
  let reworkCount     = $derived($orders.filter(o => o.stage?.state === 'REWORK').length);

  onMount(async () => {
    await loadStationOrders();

    unsubscribe = realtimeStore.subscribeToStation(station, () => {
      loadStationOrders();
    });

    refreshInterval = setInterval(loadStationOrders, 30000);

    // Ensure this station's chat room exists and load its messages
    await ensureRoom({ id: stationRoomId, name: station, kind: 'station', station: page.params.station.toLowerCase() });
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
      <button class="btn btn-outline" onclick={loadStationOrders}>
        <Icon name="refresh-cw" size="sm" />
        {$t('common.refresh', { default: 'Refresh' })}
      </button>
    </div>
  </header>

  <div class="filters">
    <button
      class="filter-btn"
      class:active={$filter === 'ALL'}
      onclick={() => $filter = 'ALL'}
    >
      All ({$orders.length})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'QUEUED'}
      onclick={() => $filter = 'QUEUED'}
    >
      Queued ({queuedCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'IN_PROGRESS'}
      onclick={() => $filter = 'IN_PROGRESS'}
    >
      In Progress ({inProgressCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'BLOCKED'}
      onclick={() => $filter = 'BLOCKED'}
    >
      Blocked ({blockedCount})
    </button>
    <button
      class="filter-btn"
      class:active={$filter === 'REWORK'}
      onclick={() => $filter = 'REWORK'}
    >
      Rework ({reworkCount})
    </button>
  </div>

  {#if $loading}
    <div class="loading-state">
        <div class="spinner"></div>
      <p>Loading orders...</p>
    </div>
  {:else if filteredOrders.length === 0}
    <div class="empty-state">
      <svg class="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <h3>No orders in this state</h3>
      <p>Orders will appear here when they reach this station.</p>
    </div>
  {:else}
    <div class="orders-grid">
      {#each filteredOrders as order (order.id)}
        <article class="station-order-card">
          <div class="order-header">
            <div>
              <h3>{order.title}</h3>
              <span class="po-number">{order.po_number}</span>
            </div>
            <span class="priority-badge priority-{order.priority}">
              P{order.priority}
            </span>
          </div>

          <div class="order-info">
            <div class="info-item">
              <span class="label">Client:</span>
              <span class="value">{order.client}</span>
            </div>
            <div class="info-item">
              <span class="label">Due:</span>
              <span class="value">{new Date(order.due_date).toLocaleDateString()}</span>
            </div>
            <div class="info-item">
              <span class="label">Status:</span>
              <span class="status-badge status-{order.stage?.state?.toLowerCase()}">
                {order.stage?.state?.replace('_', ' ')}
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
            {#if order.stage?.state === 'QUEUED' || order.stage?.state === 'NOT_STARTED'}
              <button class="btn btn-sm btn-success" onclick={() => startOrder(order.id)}>
                <Icon name="play" size="sm" />
                {$t('stationView.start', { default: 'Start' })}
              </button>
            {/if}

            {#if order.stage?.state === 'IN_PROGRESS'}
              <button class="btn btn-sm btn-success" onclick={() => completeOrder(order.id)}>
                <Icon name="check" size="sm" />
                {$t('stationView.complete', { default: 'Complete' })}
              </button>
              <button class="btn btn-sm btn-warning" onclick={() => openReworkModal(order.id)}>
                <Icon name="rotate-ccw" size="sm" />
                {$t('stationView.rework', { default: 'Rework' })}
              </button>
              <button class="btn btn-sm btn-danger" onclick={() => openBlockModal(order.id)}>
                <Icon name="ban" size="sm" />
                {$t('stationView.block', { default: 'Block' })}
              </button>
            {/if}

            {#if order.stage?.state === 'BLOCKED'}
              <button class="btn btn-sm btn-primary" onclick={() => updateStageState(order.id, 'IN_PROGRESS')}>
                <Icon name="play" size="sm" />
                {$t('stationView.resume', { default: 'Resume' })}
              </button>
            {/if}

            {#if order.stage?.state === 'REWORK'}
              <button class="btn btn-sm btn-primary" onclick={() => updateStageState(order.id, 'IN_PROGRESS')}>
                <Icon name="wrench" size="sm" />
                {$t('stationView.start_rework', { default: 'Start Rework' })}
              </button>
            {/if}

            <a href="/orders/{order.id}" class="btn btn-sm btn-outline">
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
        <button class="btn btn-danger" onclick={submitBlock} disabled={!blockReason.trim()}>
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
        <button class="btn btn-warning" onclick={submitRework} disabled={!reworkDescription.trim()}>
          <Icon name="rotate-ccw" size="sm" />
          {$t('stationView.confirm_rework', { default: 'Submit Rework' })}
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

  .status-queued { background: var(--link, var(--brand)); color: var(--bg-0); }
  .status-in_progress { background: var(--brand); color: var(--bg-0); }
  .status-blocked { background: var(--error); color: var(--bg-0); }
  .status-rework { background: var(--warn); color: black; }
  .status-completed { background: var(--ok); color: var(--bg-0); }

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
</style>
