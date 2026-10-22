<script lang="ts">
  import Activity from 'lucide-svelte/icons/activity';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import Package from 'lucide-svelte/icons/package';
  import { onMount, getContext } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';

  import Input from '$lib/ui/Input.svelte';
  import Tooltip from '$lib/ui/Tooltip.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import type { Order, Station, Badge as BadgeCode } from '$lib/order/types';
  import type { OrderState } from '$lib/order/orderState.svelte';
  import { blankStages, type StageState } from '$lib/order/stages';

  const orderState = getContext<OrderState>('orderState');
  import { TERMS } from '$lib/order/names';
  import { t } from 'svelte-i18n';
  import OrderBadges from '$lib/badges/OrderBadges.svelte';
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import { buildOrderBadges, isTerminalOrderStatus, stageBadge } from '$lib/badges/catalog';
  import { currentDay } from '$lib/badges/current-day';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { can } from '$lib/auth/permission-utils';
  import { dragging } from '$lib/dnd';
  import Icon from '$lib/ui/Icon.svelte';
  import KpiCard from '$lib/ui/KpiCard.svelte';

  type OrderRow = {
    id: string;
    poNumber: string;
    order: Order | null;
    client: string;
    title: string;
    stages: [Station, StageState][];
    due: string;
    loadingDate: string;
    badges: BadgeCode[];
    href: string;
    isDraft: boolean;
    expanded: boolean;
  };

  function toRow(order: Order): OrderRow {
    if (!order) {
      return {
        id: 'N/A',
        poNumber: '—',
        order: null,
        client: 'Unknown',
        title: 'Unknown Order',
        stages: [],
        due: '',
        loadingDate: '',
        badges: [],
        href: `${base}/orders/unknown`,
        isDraft: false,
        expanded: false
      };
    }

    const stagesMap = order.stages ?? blankStages();
    const stagesEntries = stagesMap && typeof stagesMap === 'object'
      ? Object.entries(stagesMap)
      : [];

    return {
      id: order.id || 'N/A',
      poNumber: order.poNumber && order.poNumber !== 'N/A' ? order.poNumber : order.id.slice(0, 8),
      order,
      client: order.client || 'Unknown',
      title: order.title || 'Untitled',
      stages: stagesEntries as [Station, StageState][],
      due: order.due || '',
      loadingDate: order.loadingDate || '',
      badges: Array.isArray(order.badges) ? order.badges : [],
      href: order.id ? `${base}/orders/${encodeURIComponent(order.id)}` : `${base}/orders/unknown`,
      isDraft: order.isDraft || false,
      expanded: false
    };
  }

  // rows is derived reactively from filteredOrders below
  let q = $state('');
  let sortKey = $state<'id' | 'client' | 'title' | 'due' | 'loadingDate'>('due');
  let sortAsc = $state(true);
  let statusFilter = $state<'all' | 'draft' | 'active' | 'completed'>('all');
  let refreshing = $state(false);
  let currentPage = $state(1);
  let itemsPerPage = $state(20);
  let hasLoadedOnce = $state(false);
  // Track expanded row ids in dedicated state — `rows` is $derived and immutable
  let expandedIds = $state<Set<string>>(new SvelteSet());

  let qLower = $derived(q.trim().toLowerCase());

  // Use $derived for reactive filtering instead of $effect + untrack
  let filteredOrders = $derived.by(() => {
    const orders = orderState.orders;
    return isAdmin
      ? orders
      : orders.filter((order: any) => !order.isDraft);
  });

  // Map orders → row view-model. `expanded` is read live from expandedIds,
  // so toggling re-renders without mutating `rows`.
  let rows = $derived(filteredOrders.map((o) => {
    const r = toRow(o);
    r.expanded = expandedIds.has(r.id);
    return r;
  }));

  let isLoading = $derived(orderState.loading);
  let errorMessage = $derived(orderState.lastError || '');

  // Use slice().sort() instead of toSorted() for browser compatibility
  let visible = $derived.by(() => {
    let filtered = rows || [];

    if (statusFilter === 'draft') {
      filtered = filtered.filter(r => r?.isDraft);
    } else if (statusFilter === 'active') {
      filtered = filtered.filter(r => !r?.isDraft && !isTerminalOrderStatus(r.order?.status));
    } else if (statusFilter === 'completed') {
      filtered = filtered.filter(r => ['DISPATCHED', 'ARCHIVED', 'DONE', 'COMPLETED'].includes(r.order?.status ?? ''));
    }

    if (qLower) {
      filtered = filtered.filter((row) => {
        if (!row) return false;
        return `${row.id} ${row.poNumber} ${row.client} ${row.title}`.toLowerCase().includes(qLower);
      });
    }

    // Use slice() to create a copy, then sort it
    return filtered.slice().sort((a, b) => {
      if (!a || !b) return 0;
      let av = (sortKey === 'id' ? a.poNumber : a[sortKey]) || '';
      let bv = (sortKey === 'id' ? b.poNumber : b[sortKey]) || '';
      const result = av > bv ? 1 : av < bv ? -1 : 0;
      return sortAsc ? result : -result;
    });
  });

  let totalPages = $derived(Math.max(1, Math.ceil((visible?.length || 0) / itemsPerPage)));
  let paginatedRows = $derived((visible || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));
  $effect(() => { void qLower; void statusFilter; void itemsPerPage; currentPage = 1; });
  $effect(() => { if (currentPage > totalPages) currentPage = totalPages; });

  let isAdmin = $derived(
    $currentUser?.role === 'RD' ||
    $currentUser?.role === 'Boss' ||
    $currentUser?.role === 'HeadOfProduction'
  );
  let isSuperAdmin = $derived($currentUser?.role === 'RD' || $currentUser?.role === 'Boss');

  let totalOrders = $derived(rows?.length || 0);
  let draftOrders = $derived((rows || []).filter(r => r?.isDraft).length);
  let urgentOrders = $derived(rows.filter(r => buildOrderBadges(r.order, $currentDay)
    .some(b => ['urgent', 'overdue', 'due_today', 'due_soon'].includes(b.id))).length);
  let activeOrders = $derived(rows.filter(r => !r.isDraft && !isTerminalOrderStatus(r.order?.status)).length);

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      await orderState.load();
      // Keep the last successful table visible during subsequent refreshes.
      if (!orderState.lastError) hasLoadedOnce = true;
    } finally {
      refreshing = false;
    }
  }

  function createNewOrder() {
    goto(`${base}/orders/new`);
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
  }

  function toggleExpand(rowId: string) {
    if (expandedIds.has(rowId)) expandedIds.delete(rowId);
    else expandedIds.add(rowId);
  }

  const stationLabel = (code: Station) => $t(TERMS.stations[code]);

  function exportToPDF() {
    const csvContent = visible.map(row =>
      `${row.poNumber},${row.client},${row.title},${row.due},${row.loadingDate || 'N/A'}`
    ).join('\n');
    const blob = new Blob([`PO,Client,Title,Due Date,Loading Date\n${csvContent}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load orders on mount (Svelte 5 correct pattern for initialization)
  onMount(() => {
    console.log('🚀 Orders page mounted');
    refresh();
  });
</script>

<ErrorBoundary componentName="Orders Page">
{#if errorMessage}
  <div class="error-banner" role="alert">
    <div class="error-content">
      <Icon name="alert-circle" size="md" />
      <div class="error-text">
        <strong>{$t('orderLists.errors.label', { default: 'Error' })}:</strong> {errorMessage}
      </div>
      <button class="error-close" onclick={() => errorMessage = ''} aria-label={$t('common.dismiss_error')}>
        ×
      </button>
    </div>
  </div>
{/if}

{#if isLoading && !hasLoadedOnce}
  <div class="loading-container">
    <div class="rf-spinner"></div>
    <p>{$t('orderLists.loading', { default: 'Loading orders…' })}</p>
  </div>
{:else}
<div class="page-header">
  <div class="header-left">
    <h1 class="page-title">{$t('orderLists.title')}</h1>
    <p class="page-subtitle">{$t('ordersList.manage_subtitle')}</p>
  </div>
  <div class="header-actions">
    {#if isSuperAdmin}
      <button class="btn btn-primary" onclick={createNewOrder}>
        <Icon name="plus" size="sm" />
        {$t('orderLists.create_draft', { default: 'Create Draft Order' })}
      </button>
    {/if}
    {#if can($currentUser, 'reviewQueue')}
      <a class="btn btn-secondary" href="{base}/orders/review">
        <Icon name="check-square" size="sm" />
        {$t('orderLists.review_queue', { default: 'Review queue' })}
      </a>
    {/if}
    <button class="btn btn-secondary" onclick={refresh} disabled={refreshing}>
      <span class:spinning={refreshing}><Icon name="refresh-cw" size="sm" /></span>
      {$t('common.refresh')}
    </button>
    <button class="btn btn-ghost" onclick={exportToPDF}>
      <Icon name="download" size="sm" />
      {$t('orderLists.export', { default: 'Export' })}
    </button>
  </div>
</div>

<div class="kpi-section">
  <KpiCard
    title={$t('ordersList.total_orders')}
    value={totalOrders.toString()}
    icon="package"
  />
  <KpiCard
    title={$t('ordersList.active_orders')}
    value={activeOrders.toString()}
    icon="activity"
  />
  {#if isAdmin}
    <KpiCard
      title={$t('ordersList.draft_orders')}
      value={draftOrders.toString()}
      icon="file-plus"
    />
  {/if}
  <KpiCard
    title={$t('orderLists.urgent_3d', { default: 'Urgent (≤3 days)' })}
    value={urgentOrders.toString()}
    icon="alert-circle"
  />
</div>

<section class="card orders-card">
  <div class="filter-bar">
    <div class="filter-left">
      <div class="search-box">
        <Icon name="search" size="sm" />
        <Input bind:value={q} placeholder={$t('orderLists.filter_placeholder')} ariaLabel={$t('orderLists.filter_label')} />
      </div>
      <div class="status-filters" role="group" aria-label={$t('orderLists.status_filter', { default: 'Filter by status' })}>
        <button type="button" class="filter-btn" class:active={statusFilter === 'all'} aria-pressed={statusFilter === 'all'} onclick={() => { statusFilter = 'all'; currentPage = 1; }}>
          {$t('orderLists.filters.all', { default: 'All' })} ({rows.length})
        </button>
        <button type="button" class="filter-btn" class:active={statusFilter === 'active'} aria-pressed={statusFilter === 'active'} onclick={() => { statusFilter = 'active'; currentPage = 1; }}>
          {$t('orderLists.filters.active', { default: 'Active' })} ({activeOrders})
        </button>
        {#if isAdmin}
          <button type="button" class="filter-btn" class:active={statusFilter === 'draft'} aria-pressed={statusFilter === 'draft'} onclick={() => { statusFilter = 'draft'; currentPage = 1; }}>
            {$t('orderLists.filters.drafts', { default: 'Drafts' })} ({draftOrders})
          </button>
        {/if}
      </div>
    </div>
    <div class="filter-right">
      <Tooltip text={$t('ordersList.sort_hint')} />
    </div>
  </div>

  <div class="table-wrapper">
    <p class="mobile-table-hint">{$t('orderLists.scroll_hint', { default: 'Swipe sideways to see more order details.' })}</p>
    <div class="rf-scroll" style="max-height:65vh" role="region" tabindex="0" aria-label={$t('orderLists.table_region', { default: 'Scrollable orders table' })}>
      <table class="rf-table orders-table">
        <thead>
          <tr>
            <th style="width:40px"></th>
            <th style="width:120px" aria-sort={sortKey === 'id' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
              <button type="button" class="sort-trigger" data-sort={sortKey === 'id' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('id')}>
                {$t('orderLists.headers.po')}
              </button>
            </th>
            <th style="width:140px" aria-sort={sortKey === 'client' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
              <button type="button" class="sort-trigger" data-sort={sortKey === 'client' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('client')}>
                {$t('orderLists.headers.client')}
              </button>
            </th>
            <th aria-sort={sortKey === 'title' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
              <button type="button" class="sort-trigger" data-sort={sortKey === 'title' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('title')}>
                {$t('orderLists.headers.title')}
              </button>
            </th>
            <th style="width:110px" aria-sort={sortKey === 'loadingDate' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
              <button type="button" class="sort-trigger" data-sort={sortKey === 'loadingDate' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('loadingDate')}>
                {$t('orderLists.headers.loading')}
              </button>
            </th>
            <th style="width:100px" aria-sort={sortKey === 'due' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
              <button type="button" class="sort-trigger" data-sort={sortKey === 'due' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('due')}>
                {$t('orderLists.headers.due')}
              </button>
            </th>
            <th style="width:200px">{$t('orderLists.headers.badges')}</th>
            <th style="width:80px">{$t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedRows as row (row.id)}
            <tr class="order-row rowi" class:expanded={row.expanded} class:is-draft={row.isDraft}>
              <td>
                <button
                  class="expand-btn"
                  onclick={() => toggleExpand(row.id)}
                  aria-expanded={row.expanded}
                  aria-label={row.expanded ? $t('orderLists.collapse', { default: 'Collapse' }) : $t('orderLists.expand', { default: 'Expand' })}>
                  {row.expanded ? '▼' : '▶'}
                </button>
              </td>
              <td>
                <div class="po-cell">
                  <a
                    href={row.href}
                    class="order-link"
                    draggable="true"
                    ondragstart={(e) => {
                      e.dataTransfer?.setData('text/plain', row.id);
                      dragging.set({ type: 'po', po: row.id });
                    }}
                    ondragend={() => dragging.set(null)}
                    aria-label={$t('orderLists.drag_aria', { default: 'Drag {id} to a loading day', values: { id: row.id } })}>
                    {row.poNumber}
                  </a>
                </div>
              </td>
              <td>{row.client}</td>
              <td class="title-cell">{row.title}</td>
              <td>{row.loadingDate ? row.loadingDate : '—'}</td>
              <td>{row.due}</td>
              <td>
                <div class="badges-cell">
                  <OrderBadges order={row.order} />
                </div>
              </td>
              <td>
                <div class="actions-cell">
                  <a href={row.href} class="action-icon" title={$t('ordersList.view_order')}>
                    <Icon name="eye" size="sm" />
                  </a>
                  {#if isAdmin && row.id && row.id !== 'N/A'}
                    <a href="{base}/orders/{row.id}/edit" class="action-icon" title={$t('ordersList.edit_order')}>
                      <Icon name="edit" size="sm" />
                    </a>
                  {/if}
                </div>
              </td>
            </tr>
            {#if row.expanded}
              <tr class="expanded-row">
                <td colspan="8">
                  <div class="expanded-content">
                    <div class="expanded-section">
                      <h4>{$t('orderLists.headers.stages')}</h4>
                      <div class="stages-grid">
                        {#each row.stages.slice(0, 6) as [station, state]}
                          <div class="stage-item">
                            <strong>{stationLabel(station)}</strong>
                            <SemanticBadge badge={stageBadge(state)} />
                          </div>
                        {/each}
                      </div>
                    </div>
                    <div class="expanded-actions">
                      <a href={row.href} class="tag">{$t('orderLists.view_details', { default: 'View Details' })} →</a>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
          {#if paginatedRows.length === 0}
            <tr>
              <td colspan="8" class="empty-message">
                {#if isLoading}
                  <div class="rf-spinner" style="margin: 0 auto;"></div>
                {:else if errorMessage}
                  <div class="empty-state">
                    <Icon name="alert-circle" size="xl" />
                    <h3>{$t('orderLists.errors.title', { default: 'Unable to load orders' })}</h3>
                    <p>{$t('orderLists.errors.body', { default: 'There was a problem loading the orders list.' })}</p>
                    <button class="btn btn-primary" onclick={refresh}>
                      {$t('common.retry')}
                    </button>
                  </div>
                {:else}
                  <div class="empty-state">
                    <Icon name="package" size="xl" />
                    <h3>{$t('orderLists.empty')}</h3>
                    <p>{$t('orderLists.empty_body', { default: 'No orders match your current filters.' })}</p>
                  </div>
                {/if}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  {#if totalPages > 1}
    <div class="pagination">
      <div class="pagination-info">
        {$t('orderLists.pagination_info', {
          default: 'Showing {from} – {to} of {total}',
          values: {
            from: (currentPage - 1) * itemsPerPage + 1,
            to: Math.min(currentPage * itemsPerPage, visible.length),
            total: visible.length
          }
        })}
      </div>
      <div class="pagination-controls">
        <button
          class="pagination-btn"
          disabled={currentPage === 1}
          onclick={() => currentPage = 1}
          title={$t('common.first_page')}
          aria-label={$t('common.first_page')}
        >
          ««
        </button>
        <button
          class="pagination-btn"
          disabled={currentPage === 1}
          onclick={() => currentPage--}
          title={$t('common.previous_page')}
          aria-label={$t('common.previous_page')}
        >
          <Icon name="chevron-left" size="sm" />
        </button>
        <span class="pagination-current">
          {$t('orderLists.page_of', { default: 'Page {current} of {total}', values: { current: currentPage, total: totalPages } })}
        </span>
        <button
          class="pagination-btn"
          disabled={currentPage === totalPages}
          onclick={() => currentPage++}
          title={$t('common.next_page')}
          aria-label={$t('common.next_page')}
        >
          <Icon name="chevron-right" size="sm" />
        </button>
        <button
          class="pagination-btn"
          disabled={currentPage === totalPages}
          onclick={() => currentPage = totalPages}
          title={$t('common.last_page')}
          aria-label={$t('common.last_page')}
        >
          »»
        </button>
      </div>
      <div class="items-per-page">
        <label>
          <span>{$t('orderLists.per_page', { default: 'Per page:' })}</span>
          <select bind:value={itemsPerPage} onchange={() => currentPage = 1}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>
    </div>
  {/if}
</section>
{/if}
</ErrorBoundary>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .page-title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
  }

  .page-subtitle {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-muted, var(--ink-tertiary));
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard),
      transform  var(--motion-sm) var(--ease-spring-soft),
      box-shadow var(--motion-sm) var(--ease-standard);
    border: 1px solid transparent;
  }

  .btn-primary {
    background:
      linear-gradient(180deg,
        color-mix(in oklab, var(--brand) 96%, white) 0%,
        var(--brand) 100%);
    color: #fff;
    border-color: transparent;
    box-shadow:
      0 4px 14px -2px color-mix(in oklab, var(--brand) 35%, transparent),
      inset 0 1px 0 color-mix(in oklab, white 22%, transparent);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.06);
    box-shadow:
      0 8px 22px -4px color-mix(in oklab, var(--brand) 45%, transparent),
      inset 0 1px 0 color-mix(in oklab, white 30%, transparent);
  }

  .btn-secondary {
    background: var(--glass-bg);
    color: var(--text);
    border-color: var(--border);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-2);
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }

  .btn-ghost {
    background: transparent;
    color: var(--ink-secondary);
    border-color: transparent;
  }

  .btn-ghost:hover:not(:disabled) {
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    color: var(--ink-primary);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .kpi-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .orders-card {
    padding: 0;
    overflow: hidden;
  }

  .filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .filter-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
    flex: 1;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0 12px;
    min-width: 240px;
  }

  .search-box :global(input) {
    border: none;
    background: transparent;
    padding: 8px 0;
    min-width: 180px;
  }

  .search-box :global(svg) {
    color: var(--text-muted);
  }

  .status-filters {
    display: flex;
    gap: 4px;
    background: var(--bg-1);
    border-radius: 8px;
    padding: 4px;
    border: 1px solid var(--border);
  }

  .filter-btn {
    padding: 6px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: var(--text-muted);
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .filter-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .filter-btn.active {
    background: var(--primary, var(--brand));
    color: var(--bg-0);
  }

  .filter-right {
    display: flex;
    align-items: center;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .orders-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .orders-table th,
  .orders-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .orders-table th {
    background: var(--bg-1);
    font-weight: 600;
    color: var(--text-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
  }

  .order-row {
    transition: background 0.15s ease;
  }

  .order-row:hover {
    background: var(--bg-2);
  }

  .order-row.expanded {
    background: color-mix(in oklab, var(--primary, var(--brand)) 5%, transparent);
  }

  .order-row.is-draft {
    background: color-mix(in oklab, var(--warning, var(--warn)) 5%, transparent);
  }

  .order-row.is-draft:hover {
    background: color-mix(in oklab, var(--warning, var(--warn)) 10%, transparent);
  }

  .po-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .order-link {
    color: var(--primary, var(--brand));
    text-decoration: none;
    font-weight: 600;
  }

  .order-link:hover {
    text-decoration: underline;
  }

  .title-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .expand-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 6px 8px;
    color: var(--text-muted);
    border-radius: 4px;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .expand-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .badges-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  @media (min-width: 64rem) {

  }

  .actions-cell {
    display: flex;
    gap: 4px;
  }

  .action-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: var(--text-muted);
    text-decoration: none;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .action-icon:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .expanded-row {
    background: var(--bg-2);
  }

  .expanded-content {
    padding: var(--space-lg);
    display: grid;
    gap: var(--space-lg);
  }

  .expanded-section {
    display: grid;
    gap: var(--space-sm);
  }

  .expanded-section h4 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .stages-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-sm);
  }

  .stage-item {
    display: flex;
  }

  .expanded-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
  }

  .empty-message {
    text-align: center;
    padding: 48px !important;
    color: var(--text-muted);
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border);
    background: var(--bg-1);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .pagination-info {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .pagination-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    padding: 0 8px;
    border: 1px solid var(--border);
    background: var(--bg-1);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text);
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
  }

  .pagination-btn:hover:not(:disabled) {
    background: var(--bg-2);
    border-color: var(--text-muted);
  }

  .pagination-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pagination-current {
    padding: 0 12px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .items-per-page {
    display: flex;
    align-items: center;
  }

  .items-per-page label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .items-per-page select {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-1);
    font-size: 0.85rem;
    cursor: pointer;
  }

  @media (max-width: 1024px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-actions {
      justify-content: flex-end;
    }
  }

  @media (max-width: 768px) {
    .page-header { gap: var(--space-lg); }
    .header-actions { justify-content: flex-start; }
    .filter-bar { flex-direction: column; align-items: stretch; }
    .filter-left { flex-direction: column; align-items: stretch; }
    .search-box { width: 100%; min-width: 0; }
    .status-filters { max-width: 100%; overflow-x: auto; justify-content: flex-start; }
    .pagination { flex-direction: column; align-items: stretch; }
    .pagination-controls { justify-content: center; }
    .pagination-info, .items-per-page { text-align: center; justify-content: center; }
    .mobile-table-hint { display: block; }
  }
  @media (max-width: 480px) {
    .header-actions .btn { min-height: 40px; }
    .header-actions .btn span { display: inline; }
    .kpi-section { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  .error-banner {
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    z-index: var(--z-overlay);
    background: var(--danger-light);
    border-bottom: 2px solid var(--danger);
    padding: var(--space-md);
    animation: slideDown 0.3s ease;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .error-content {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    max-width: 1400px;
    margin: 0 auto;
    color: var(--danger);
  }

  .error-text {
    flex: 1;
    font-size: 0.9rem;
  }

  .error-text strong {
    font-weight: 600;
  }

  .error-close {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: var(--danger);
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .error-close:hover {
    background: var(--danger);
    color: white;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: var(--space-md);
  }

  .loading-container p {
    color: var(--text-muted);
    font-size: var(--font-size-lg);
  }

  .empty-state {
    text-align: center;
    padding: var(--space-2xl) var(--space-lg);
    color: var(--text-muted);
  }

  .empty-state h3 {
    font-size: var(--font-size-xl);
    color: var(--text-1);
    margin-bottom: var(--space-sm);
  }

  .empty-state p {
    font-size: var(--font-size-base);
    margin-bottom: var(--space-lg);
  }

  /* LUMIGRID-inspired operator density: deliberate hierarchy, no floating pills. */
  .page-header {
    position: relative; padding: var(--space-lg) 0 var(--space-lg);
    border-bottom: 1px solid var(--divider);
    margin-bottom: var(--space-xl);
  }
  .page-header::before {
    content: ''; position:absolute; top:0; left:0; width:72px; height:2px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);
  }
  .page-title { font-size:clamp(1.5rem,2.4vw,2.1rem); letter-spacing:var(--tracking-tight); }
  .page-subtitle { font-size:var(--text-sm); max-width:65ch; }
  .btn { min-height:40px; border-radius:var(--radius-md); line-height:1.2; }
  .btn-primary { background:var(--brand); color:var(--on-brand); box-shadow:var(--elevation-1); }
  .btn-primary:hover:not(:disabled) { background:var(--brand-2); box-shadow:var(--elevation-2); }
  .kpi-section { gap:var(--space-sm); }
  .orders-card { background:var(--glass-bg-strong); border-color:var(--glass-border); }
  .filter-bar { background:var(--glass-bg-strong); padding:var(--space-lg); }
  .search-box { border-radius:var(--radius-md); min-height:42px; }
  .search-box:focus-within { border-color:var(--focus); box-shadow:var(--focus-ring-soft); }
  .search-box :global(.rf-field) { flex:1; min-width:0; }
  .status-filters { border-radius:var(--radius-md); gap:var(--space-xxs); }
  .filter-btn { border-radius:var(--radius-sm); min-height:36px; white-space:nowrap; color:var(--ink-secondary); }
  .filter-btn.active { background:var(--brand-soft); color:var(--brand); box-shadow:inset 0 0 0 1px color-mix(in oklab,var(--brand) 32%,transparent); }
  .filter-btn:focus-visible,.sort-trigger:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
  .rf-scroll { overflow:auto; scrollbar-width:thin; }
  .orders-table { min-width:880px; }
  .orders-table th { background:var(--bg-1); z-index:1; font-weight:650; }
  .orders-table th,.orders-table td { padding:10px 12px; border-bottom:1px solid var(--divider); }
  .orders-table .sort-trigger { min-height:34px; padding:6px 9px; display:inline-flex; align-items:center;
    background:transparent; border:1px solid transparent; color:var(--ink-secondary);
    border-radius:var(--radius-sm); cursor:pointer; font:inherit; letter-spacing:inherit; }
  .sort-trigger:hover,.sort-trigger[data-sort="asc"],.sort-trigger[data-sort="desc"] {
    border-color:var(--border); color:var(--ink-primary); background:var(--bg-2);
  }
  .sort-trigger[data-sort="asc"]::after { content:"↑"; color:var(--brand); }
  .sort-trigger[data-sort="desc"]::after { content:"↓"; color:var(--brand); }
  .order-row:hover { background:color-mix(in oklab,var(--brand) 5%,var(--bg-1)); }
  .order-row:focus-within { background:var(--bg-2); }
  .order-link { font-weight:700; font-variant-numeric:tabular-nums; }
  .mobile-table-hint { display:none; padding:8px var(--space-lg); margin:0; font-size:var(--text-xs);
    color:var(--ink-tertiary); border-bottom:1px solid var(--divider); }
  .pagination-btn { min-height:40px; min-width:40px; border-radius:var(--radius-sm); }
  @media (prefers-reduced-motion:reduce) { .order-row,.btn { transition:none; } }
</style>
