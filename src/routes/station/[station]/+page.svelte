<script lang="ts">
  import { page } from '$app/state';
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import { realtimeStore } from '$lib/stores/realtime';
  // import StageBoard from '$lib/components/orders/StageBoard.svelte';
  // import OrderCard from '$lib/components/orders/OrderCard.svelte';
  import QRScanner from '$lib/components/QRScanner.svelte';
  import StationCompleteModal from '$lib/components/station/StationCompleteModal.svelte';

  let station = $derived(page.params.station.toUpperCase());

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

  let unsubscribe: (() => void) | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function loadStationOrders() {
    $loading = true;
    try {
      const response = await fetch(`/api/station/${station}/orders`);
      if (!response.ok) throw new Error('Failed to load orders');

      const data = await response.json();
      $orders = data;
    } catch (err) {
      console.error('Failed to load station orders:', err);
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
      alert('Failed to update stage: ' + err.message);
    }
  }

  async function handleQRScan(qrData: string) {
    // QR format: ORDER:{orderId}
    if (qrData.startsWith('ORDER:')) {
      const orderId = qrData.replace('ORDER:', '');
      await updateStageState(orderId, 'IN_PROGRESS');
      $showScanner = false;
    }
  }

  async function startOrder(orderId: string) {
    // Use window.confirm to avoid TS warning or better yet, a custom modal
    if (window.confirm('Start this order at this station?')) {
      await updateStageState(orderId, 'IN_PROGRESS');
    }
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
          body: JSON.stringify({
            items,
            skipped: opts.skipped,
            skipReason: opts.skipReason,
          }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: payload?.error ?? `HTTP ${res.status}` };
      return {
        ok: true,
        consumed: payload?.consumed ?? 0,
        lowStock: payload?.lowStock ?? [],
      };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Network error' };
    }
  }

  function onCompletionSubmitted(p: { consumed: number; skipped: boolean; lowStock: any[] }) {
    completeTarget = null;
    if (p.lowStock.length > 0) {
      const skus = p.lowStock.map((h: any) => h.sku || h.name).join(', ');
      alert(`Low stock after this completion: ${skus}. HoP has been notified.`);
    }
    loadStationOrders();
  }

  async function blockOrder(orderId: string) {
    const reason = prompt('Enter blocking reason:');
    if (reason) {
      try {
        await fetch(`/api/orders/${orderId}/stages?station=${station}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: 'BLOCKED',
            blocked_reason: reason
          })
        });
        await loadStationOrders();
      } catch (err) {
        alert('Failed to block order');
      }
    }
  }

  async function requestRework(orderId: string) {
    const reason = prompt('Select rework reason:', 'RECUT');
    const description = prompt('Describe the issue:');

    if (reason && description) {
      try {
        await fetch(`/api/orders/${orderId}/rework`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            station,
            reason,
            description
          })
        });
        await loadStationOrders();
      } catch (err) {
        alert('Failed to create rework request');
      }
    }
  }

  let filteredOrders = $derived($orders.filter(order => {
    if ($filter === 'ALL') return true;
    return order.stage?.state === $filter;
  }));

  let queuedCount = $derived($orders.filter(o => o.stage?.state === 'QUEUED').length);
  let inProgressCount = $derived($orders.filter(o => o.stage?.state === 'IN_PROGRESS').length);
  let blockedCount = $derived($orders.filter(o => o.stage?.state === 'BLOCKED').length);
  let reworkCount = $derived($orders.filter(o => o.stage?.state === 'REWORK').length);

  onMount(async () => {
    await loadStationOrders();

    // Subscribe to real-time updates
    unsubscribe = realtimeStore.subscribeToStation(station, () => {
      loadStationOrders();
    });

    // Refresh every 30 seconds
    refreshInterval = setInterval(loadStationOrders, 30000);
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
        <svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="9" x2="15" y2="9"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        Scan QR
      </button>
      <button class="btn btn-outline" onclick={loadStationOrders}>
        <svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Refresh
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
                ▶️ Start
              </button>
            {/if}

            {#if order.stage?.state === 'IN_PROGRESS'}
              <button class="btn btn-sm btn-success" onclick={() => completeOrder(order.id)}>
                ✓ Complete
              </button>
              <button class="btn btn-sm btn-warning" onclick={() => requestRework(order.id)}>
                🔄 Rework
              </button>
              <button class="btn btn-sm btn-danger" onclick={() => blockOrder(order.id)}>
                🚫 Block
              </button>
            {/if}

            {#if order.stage?.state === 'BLOCKED'}
              <button class="btn btn-sm btn-primary" onclick={() => updateStageState(order.id, 'IN_PROGRESS')}>
                ▶️ Resume
              </button>
            {/if}

            {#if order.stage?.state === 'REWORK'}
              <button class="btn btn-sm btn-primary" onclick={() => updateStageState(order.id, 'IN_PROGRESS')}>
                🔧 Start Rework
              </button>
            {/if}

            <a href="/orders/{order.id}" class="btn btn-sm btn-outline">
              👁️ Details
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
    font-size: 2rem;
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
