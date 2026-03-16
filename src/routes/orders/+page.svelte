<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';

  import Input from '$lib/ui/Input.svelte';
  import Tooltip from '$lib/ui/Tooltip.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import type { Order, Station, Badge as BadgeCode } from '$lib/order/types';
  import { orderState } from '$lib/order/orderState.svelte';
  import { blankStages, STATE_LABEL, type StageState } from '$lib/order/stages';
  import { TERMS } from '$lib/order/names';
  import { t } from 'svelte-i18n';
  import { BADGE_ICONS, badgeTone } from '$lib/order/badges';
  import Badge from '$lib/ui/Badge.svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { dragging } from '$lib/dnd';
  import { Plus, Download, Activity, AlertCircle, FilePlus, Filter, RefreshCw, Eye, Edit, Trash2, MoreVertical, Search, ChevronLeft, ChevronRight, Package } from 'lucide-svelte';
  import KpiCard from '$lib/ui/KpiCard.svelte';

  type OrderRow = {
    id: string;
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
      client: order.client || 'Unknown',
      title: order.title || 'Untitled',
      stages: stagesEntries as [Station, StageState][],
      due: order.due || '',
      loadingDate: order.loadingDate || '',
      badges: Array.isArray(order.badges) ? order.badges : [],
      href: `${base}/orders/${encodeURIComponent(order.id || 'unknown')}`,
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

  let qLower = $derived(q.trim().toLowerCase());
  
  // Use $derived for reactive filtering instead of $effect + untrack
  let filteredOrders = $derived.by(() => {
    const orders = orderState.orders;
    return isAdmin 
      ? orders 
      : orders.filter((order: any) => !order.isDraft);
  });

  // Update rows reactively using $derived (not imperative assignment)
  let rows = $derived(filteredOrders.map(toRow));

  let isLoading = $derived(orderState.loading);
  let errorMessage = $derived(orderState.lastError || '');

  // Use slice().sort() instead of toSorted() for browser compatibility
  let visible = $derived.by(() => {
    let filtered = rows || [];
    
    if (statusFilter === 'draft') {
      filtered = filtered.filter(r => r?.isDraft);
    } else if (statusFilter === 'active') {
      filtered = filtered.filter(r => !r?.isDraft);
    }
    
    if (qLower) {
      filtered = filtered.filter((row) => {
        if (!row) return false;
        return `${row.id || ''} ${row.client || ''} ${row.title || ''}`.toLowerCase().includes(qLower);
      });
    }
    
    // Use slice() to create a copy, then sort it
    return filtered.slice().sort((a, b) => {
      if (!a || !b) return 0;
      let av = a[sortKey] || '';
      let bv = b[sortKey] || '';
      const result = av > bv ? 1 : av < bv ? -1 : 0;
      return sortAsc ? result : -result;
    });
  });

  let totalPages = $derived(Math.max(1, Math.ceil((visible?.length || 0) / itemsPerPage)));
  let paginatedRows = $derived((visible || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));

  let isSuperAdmin = $derived($currentUser?.roles?.Admin === 'SuperAdmin');
  let isAdmin = $derived($currentUser?.primarySection === 'Admin' || isSuperAdmin);
  
  let totalOrders = $derived(rows?.length || 0);
  let draftOrders = $derived((rows || []).filter(r => r?.isDraft).length);
  let urgentOrders = $derived((rows || []).filter(r => {
    if (!r?.due) return false;
    const dueDate = new Date(r.due);
    const today = new Date();
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays >= 0;
  }).length);
  let activeOrders = $derived(totalOrders - draftOrders);

  async function refresh() {
    refreshing = true;
    await orderState.load();
    refreshing = false;
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
    rows = rows.map(row => 
      row.id === rowId ? { ...row, expanded: !row.expanded } : row
    );
  }

  const stationLabel = (code: Station) => $t(TERMS.stations[code]);
  const badgeLabel = (badge: BadgeCode) => $t(TERMS.badges[badge]);
  
  function exportToPDF() {
    const csvContent = visible.map(row => 
      `${row.id},${row.client},${row.title},${row.due},${row.loadingDate || 'N/A'}`
    ).join('\n');
    const blob = new Blob([`PO,Client,Title,Due Date,Loading Date\n${csvContent}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load orders on mount using $effect (Svelte 5 pattern)
  $effect(() => {
    if (!hasLoadedOnce) {
      console.log('🚀 Orders page mounted');
      hasLoadedOnce = true;
      refresh();
    }
  });
</script>

<ErrorBoundary componentName="Orders Page">
{#if errorMessage}
  <div class="error-banner" role="alert">
    <div class="error-content">
      <AlertCircle size={20} />
      <div class="error-text">
        <strong>Error:</strong> {errorMessage}
      </div>
      <button class="error-close" onclick={() => errorMessage = ''} aria-label="Dismiss error">
        ×
      </button>
    </div>
  </div>
{/if}

{#if isLoading && !hasLoadedOnce}
  <div class="loading-container">
    <div class="spinner"></div>
    <p>Loading orders...</p>
  </div>
{:else}
<div class="page-header">
  <div class="header-left">
    <h1 class="page-title">{$t('orderLists.title')}</h1>
    <p class="page-subtitle">Manage and track all orders</p>
  </div>
  <div class="header-actions">
    {#if isSuperAdmin}
      <button class="btn btn-primary" onclick={createNewOrder}>
        <Plus size={18} />
        Create Draft Order
      </button>
    {/if}
    <button class="btn btn-secondary" onclick={refresh} disabled={refreshing}>
      <span class:spinning={refreshing}><RefreshCw size={18} /></span>
      Refresh
    </button>
    <button class="btn btn-ghost" onclick={exportToPDF}>
      <Download size={18} />
      Export
    </button>
  </div>
</div>

<div class="kpi-section">
  <KpiCard 
    title="Total Orders" 
    value={totalOrders.toString()} 
    icon={Package}
  />
  <KpiCard 
    title="Active Orders" 
    value={activeOrders.toString()} 
    icon={Activity}
  />
  {#if isAdmin}
    <KpiCard 
      title="Draft Orders" 
      value={draftOrders.toString()} 
      icon={FilePlus}
    />
  {/if}
  <KpiCard 
    title="Urgent (≤3 days)" 
    value={urgentOrders.toString()} 
    icon={AlertCircle}
  />
</div>

<section class="card orders-card">
  <div class="filter-bar">
    <div class="filter-left">
      <div class="search-box">
        <Search size={18} />
        <Input bind:value={q} placeholder={$t('orderLists.filter_placeholder')} ariaLabel={$t('orderLists.filter_label')} />
      </div>
      <div class="status-filters">
        <button class="filter-btn" class:active={statusFilter === 'all'} onclick={() => { statusFilter = 'all'; currentPage = 1; }}>
          All ({rows.length})
        </button>
        <button class="filter-btn" class:active={statusFilter === 'active'} onclick={() => { statusFilter = 'active'; currentPage = 1; }}>
          Active ({activeOrders})
        </button>
        {#if isAdmin}
          <button class="filter-btn" class:active={statusFilter === 'draft'} onclick={() => { statusFilter = 'draft'; currentPage = 1; }}>
            Drafts ({draftOrders})
          </button>
        {/if}
      </div>
    </div>
    <div class="filter-right">
      <Tooltip text="Click column headers to sort. Click the arrow button to expand order details." />
    </div>
  </div>

  <div class="table-wrapper">
    <div class="rf-scroll" style="max-height:60vh">
      <table class="rf-table orders-table">
        <thead>
          <tr>
            <th style="width:40px"></th>
            <th style="width:120px">
              <button class="tag ghost" data-sort={sortKey === 'id' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('id')}>
                {$t('orderLists.headers.po')}
              </button>
            </th>
            <th style="width:140px">
              <button class="tag ghost" data-sort={sortKey === 'client' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('client')}>
                {$t('orderLists.headers.client')}
              </button>
            </th>
            <th>
              <button class="tag ghost" data-sort={sortKey === 'title' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('title')}>
                {$t('orderLists.headers.title')}
              </button>
            </th>
            <th style="width:110px">
              <button class="tag ghost" data-sort={sortKey === 'loadingDate' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('loadingDate')}>
                {$t('orderLists.headers.loading')}
              </button>
            </th>
            <th style="width:100px">
              <button class="tag ghost" data-sort={sortKey === 'due' ? (sortAsc ? 'asc' : 'desc') : ''} onclick={() => toggleSort('due')}>
                {$t('orderLists.headers.due')}
              </button>
            </th>
            <th style="width:200px">{$t('orderLists.headers.badges')}</th>
            <th style="width:80px">Actions</th>
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
                  aria-label={row.expanded ? 'Collapse' : 'Expand'}>
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
                    aria-grabbed="true"
                    aria-label={`Drag ${row.id} to a loading day`}>
                    {row.id}
                  </a>
                  {#if row.isDraft}
                    <span class="draft-badge">DRAFT</span>
                  {/if}
                </div>
              </td>
              <td>{row.client}</td>
              <td class="title-cell">{row.title}</td>
              <td>{row.loadingDate ? row.loadingDate : '—'}</td>
              <td>{row.due}</td>
              <td>
                <div class="badges-cell">
                  {#if row.badges.length && !row.isDraft}
                    {#each row.badges as badge}
                      {@const label = badgeLabel(badge)}
                      <Badge tone={badgeTone(badge)} label={label}>
                        {@const SvelteComponent = BADGE_ICONS[badge]}
                        <SvelteComponent aria-hidden="true" />
                        <span class="badge-text">{label}</span>
                      </Badge>
                    {/each}
                  {:else if !row.isDraft}
                    <span class="muted">{$t('orderLists.no_badges')}</span>
                  {/if}
                </div>
              </td>
              <td>
                <div class="actions-cell">
                  <a href={row.href} class="action-icon" title="View Order">
                    <Eye size={16} />
                  </a>
                  {#if isAdmin}
                    <a href="{base}/orders/{row.id}/edit" class="action-icon" title="Edit Order">
                      <Edit size={16} />
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
                            <span class="tag stage-tag" data-tone={STATE_LABEL[state] !== 'COMPLETED' ? 'primary' : 'success'}>
                              <strong>{stationLabel(station)}</strong>
                              <span class="muted"> · </span>
                              {$t(STATE_LABEL[state])}
                            </span>
                          </div>
                        {/each}
                      </div>
                    </div>
                    {#if row.badges.length > 0}
                      <div class="expanded-section">
                        <h4>{$t('orderLists.headers.all_badges')}</h4>
                        <div class="badges-expanded">
                          {#each row.badges as badge}
                            {@const label = badgeLabel(badge)}
                            <Badge tone={badgeTone(badge)} label={label}>
                              {@const SvelteComponent_1 = BADGE_ICONS[badge]}
                              <SvelteComponent_1 aria-hidden="true" />
                              <span>{label}</span>
                            </Badge>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    <div class="expanded-actions">
                      <a href={row.href} class="tag">View Details →</a>
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
                  <div class="spinner" style="margin: 0 auto;"></div>
                {:else if errorMessage}
                  <div class="empty-state">
                    <AlertCircle size={48} class="empty-state-icon" />
                    <h3>Unable to load orders</h3>
                    <p>There was a problem loading the orders list.</p>
                    <button class="btn btn-primary" onclick={refresh}>
                      Try Again
                    </button>
                  </div>
                {:else}
                  <div class="empty-state">
                    <Package size={48} class="empty-state-icon" />
                    <h3>{$t('orderLists.empty')}</h3>
                    <p>No orders match your current filters.</p>
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
        Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, visible.length)} of {visible.length} orders
      </div>
      <div class="pagination-controls">
        <button 
          class="pagination-btn" 
          disabled={currentPage === 1}
          onclick={() => currentPage = 1}
          title="First page"
        >
          ««
        </button>
        <button 
          class="pagination-btn" 
          disabled={currentPage === 1}
          onclick={() => currentPage--}
          title="Previous page"
        >
          <ChevronLeft size={18} />
        </button>
        <span class="pagination-current">
          Page {currentPage} of {totalPages}
        </span>
        <button 
          class="pagination-btn" 
          disabled={currentPage === totalPages}
          onclick={() => currentPage++}
          title="Next page"
        >
          <ChevronRight size={18} />
        </button>
        <button 
          class="pagination-btn" 
          disabled={currentPage === totalPages}
          onclick={() => currentPage = totalPages}
          title="Last page"
        >
          »»
        </button>
      </div>
      <div class="items-per-page">
        <label>
          <span>Per page:</span>
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
    color: var(--text-muted, #6b7280);
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
    gap: 6px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: linear-gradient(135deg, #ff6b35, #f7931e);
    color: white;
    border-color: transparent;
    box-shadow: 0 2px 8px rgba(255, 107, 53, 0.3);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.4);
  }

  .btn-secondary {
    background: var(--bg-1);
    color: var(--text);
    border-color: var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-2);
    border-color: var(--text-muted);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
    border-color: transparent;
  }

  .btn-ghost:hover {
    background: var(--bg-2);
    color: var(--text);
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
    transition: all 0.15s ease;
  }

  .filter-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .filter-btn.active {
    background: var(--primary, #3b82f6);
    color: white;
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
    z-index: 10;
  }

  .order-row {
    transition: background 0.15s ease;
  }

  .order-row:hover {
    background: var(--bg-2);
  }

  .order-row.expanded {
    background: color-mix(in oklab, var(--primary, #3b82f6) 5%, transparent);
  }

  .order-row.is-draft {
    background: color-mix(in oklab, var(--warning, #f59e0b) 5%, transparent);
  }

  .order-row.is-draft:hover {
    background: color-mix(in oklab, var(--warning, #f59e0b) 10%, transparent);
  }

  .po-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .order-link {
    color: var(--primary, #3b82f6);
    text-decoration: none;
    font-weight: 600;
  }

  .order-link:hover {
    text-decoration: underline;
  }

  .draft-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--warning, #f59e0b);
    color: white;
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
    transition: all 0.15s ease;
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

  .badge-text {
    display: none;
  }

  @media (min-width: 64rem) {
    .badge-text {
      display: inline;
    }
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
    transition: all 0.15s ease;
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

  .stage-tag {
    width: 100%;
  }

  .badges-expanded {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
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
    transition: all 0.15s ease;
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
    .filter-bar {
      flex-direction: column;
      align-items: stretch;
    }
    
    .filter-left {
      flex-direction: column;
    }
    
    .search-box {
      width: 100%;
      min-width: auto;
    }
    
    .status-filters {
      width: 100%;
      justify-content: center;
    }
    
    .pagination {
      flex-direction: column;
      gap: var(--space-sm);
    }
    
    .pagination-info, .items-per-page {
      width: 100%;
      text-align: center;
      justify-content: center;
    }
    
    .orders-table th:nth-child(4),
    .orders-table td:nth-child(4),
    .orders-table th:nth-child(5),
    .orders-table td:nth-child(5),
    .orders-table th:nth-child(8),
    .orders-table td:nth-child(8) {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .orders-table th:nth-child(3),
    .orders-table td:nth-child(3),
    .orders-table th:nth-child(7),
    .orders-table td:nth-child(7) {
      display: none;
    }
    
    .header-actions .btn span {
      display: none;
    }
    
    .header-actions .btn {
      padding: 10px;
    }
  }

  .error-banner {
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    z-index: 1000;
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

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
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

  .empty-state-icon {
    margin: 0 auto var(--space-lg);
    opacity: 0.5;
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
</style>