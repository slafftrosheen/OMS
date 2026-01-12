<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { ordersStore } from '$lib/order/signage-store';
  import type { Order } from '$lib/order/types';
  import { Calendar, ChevronLeft, ChevronRight, Plus, Truck, Download, Filter, X, Check } from 'lucide-svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import { badgeTone } from '$lib/order/badges';
  import { downloadCSV, toCSV } from '$lib/export/csv';
  import { get } from 'svelte/store';
  
  // Accept params prop to silence SvelteKit warning
  export let params = {};
  
  let today = new Date();
  let y = today.getFullYear();
  let m = today.getMonth();
  let selectedDate: string | null = null;
  let orders: Order[] = [];
  let loadingDays: any[] = [];
  let filterStatus: 'all' | 'scheduled' | 'unscheduled' = 'all';
  
  // Modal state
  let showAddOrderModal = false;
  let showNewLoadingDayModal = false;
  let newLoadingDayCarrier = '';
  let newLoadingDayNote = '';
  let availableOrders: Order[] = [];
  
  async function refreshOrders() {
    try {
      const response = await fetch('/api/draft-orders');
      if (response.ok) {
        const data = await response.json();
        orders = data.map((d: any) => ({
          id: d.id,
          poNumber: d.poNumber,
          title: d.title || d.clientName,
          client: d.clientName,
          due: d.deadline,
          loadingDate: d.loadingDate,
          badges: d.status === 'draft' ? ['DRAFT'] : [],
          fields: [],
          materials: [],
          stages: {},
          isDraft: d.status === 'draft',
          profiles: d.profiles || []
        }));
        ordersStore.set(orders);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }
  
  async function refreshLoadingDays() {
    try {
      const response = await fetch('/api/loading-days?active=true');
      if (response.ok) {
        loadingDays = await response.json();
      }
    } catch (err) {
      console.error('Failed to fetch loading days:', err);
    }
  }
  
  async function createLoadingDay() {
    if (!selectedDate) return;
    
    try {
      const response = await fetch('/api/loading-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          carrier: newLoadingDayCarrier,
          note: newLoadingDayNote
        })
      });
      
      if (response.ok) {
        await refreshLoadingDays();
        showNewLoadingDayModal = false;
        newLoadingDayCarrier = '';
        newLoadingDayNote = '';
      }
    } catch (err) {
      console.error('Failed to create loading day:', err);
    }
  }
  
  async function assignOrderToLoadingDate(orderId: number) {
    if (!selectedDate) return;
    
    try {
      const response = await fetch(`/api/draft-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loadingDate: selectedDate
        })
      });
      
      if (response.ok) {
        await refreshOrders();
        showAddOrderModal = false;
      }
    } catch (err) {
      console.error('Failed to assign order:', err);
    }
  }
  
  async function removeOrderFromLoadingDate(orderId: number) {
    try {
      const response = await fetch(`/api/draft-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loadingDate: null
        })
      });
      
      if (response.ok) {
        await refreshOrders();
      }
    } catch (err) {
      console.error('Failed to remove order:', err);
    }
  }
  
  function openAddOrderModal() {
    availableOrders = orders.filter(o => !o.loadingDate);
    showAddOrderModal = true;
  }
  
  function prev() {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  
  function next() {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  
  function getDaysInMonth(year: number, month: number): Date[] {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days: Date[] = [];
    
    // Add previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthLastDay - i));
    }
    
    // Add current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    // Add next month days to fill the grid
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  }
  
  function formatDate(date: Date): string {
    // Use local date to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  function getOrdersForDate(date: string): Order[] {
    return orders.filter(o => o.loadingDate === date);
  }
  
  function isLoadingDay(date: string): boolean {
    return loadingDays.some(l => l.date === date && l.active);
  }
  
  function getLoadingDayInfo(date: string) {
    return loadingDays.find(l => l.date === date);
  }
  
  function isToday(date: Date): boolean {
    const todayStr = formatDate(new Date());
    return formatDate(date) === todayStr;
  }
  
  function isSelectedMonth(date: Date): boolean {
    return date.getMonth() === m && date.getFullYear() === y;
  }
  
  function selectDate(date: Date) {
    selectedDate = formatDate(date);
  }
  
  function exportDayCSV() {
    if (!selectedDate) return;
    const dayOrders = getOrdersForDate(selectedDate);
    const translate = get(t);
    const columns = [
      { label: translate('calendar.columns.po') || 'PO', value: (order: Order) => order.poNumber || order.id },
      { label: translate('calendar.columns.client') || 'Client', value: (order: Order) => order.client },
      { label: translate('calendar.columns.title') || 'Title', value: (order: Order) => order.title },
      { label: translate('calendar.columns.due') || 'Due', value: (order: Order) => order.due }
    ];
    const rows = dayOrders.map((order) =>
      Object.fromEntries(columns.map((column) => [column.label, column.value(order)]))
    );
    downloadCSV(`loading-${selectedDate}.csv`, toCSV(rows, columns.map((column) => column.label)));
  }
  
  $: days = getDaysInMonth(y, m);
  $: selectedDayOrders = selectedDate ? getOrdersForDate(selectedDate) : [];
  $: selectedLoadingDay = selectedDate ? getLoadingDayInfo(selectedDate) : null;
  $: filteredOrders = filterStatus === 'all' ? orders :
                      filterStatus === 'scheduled' ? orders.filter(o => o.loadingDate) :
                      orders.filter(o => !o.loadingDate);
  $: monthName = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long' });
  
  onMount(async () => {
    await Promise.all([refreshOrders(), refreshLoadingDays()]);
    const handler = (event: StorageEvent) => {
      if (!event.key || event.key === 'rf_orders_vcs') {
        refreshOrders();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  });
</script>

<svelte:head>
  <title>Calendar - Reclame OMS</title>
</svelte:head>

<div class="calendar-page">
  <!-- Top Bar -->
  <div class="calendar-topbar">
    <div class="topbar-left">
      <Calendar size={24} />
      <h1>Loading Schedule</h1>
    </div>
    <div class="topbar-right">
      <button class="btn-secondary" on:click={() => selectedDate && (showNewLoadingDayModal = true)} disabled={!selectedDate}>
        <Plus size={18} />
        Mark Loading Day
      </button>
      <button class="btn-ghost" on:click={exportDayCSV} disabled={!selectedDate}>
        <Download size={18} />
        Export CSV
      </button>
    </div>
  </div>
  
  <!-- Main Content - Side by Side -->
  <div class="calendar-grid">
    <!-- Left: Calendar -->
    <div class="calendar-section">
      <div class="calendar-header">
        <button class="nav-btn" on:click={prev}>
          <ChevronLeft size={20} />
        </button>
        <h2 class="month-title">{monthName} {y}</h2>
        <button class="nav-btn" on:click={next}>
          <ChevronRight size={20} />
        </button>
      </div>
      
      <div class="calendar-body">
        <div class="weekdays">
          <div class="weekday">Sun</div>
          <div class="weekday">Mon</div>
          <div class="weekday">Tue</div>
          <div class="weekday">Wed</div>
          <div class="weekday">Thu</div>
          <div class="weekday">Fri</div>
          <div class="weekday">Sat</div>
        </div>
        
        <div class="days-grid">
          {#each days as day}
            {@const dateStr = formatDate(day)}
            {@const dayOrders = getOrdersForDate(dateStr)}
            {@const isLoading = isLoadingDay(dateStr)}
            <button
              class="day-cell"
              class:other-month={!isSelectedMonth(day)}
              class:today={isToday(day)}
              class:selected={selectedDate === dateStr}
              class:has-loading={isLoading}
              class:has-orders={dayOrders.length > 0}
              on:click={() => selectDate(day)}
            >
              <span class="day-number">{day.getDate()}</span>
              {#if dayOrders.length > 0}
                <span class="order-count">{dayOrders.length}</span>
              {/if}
              {#if isLoading}
                <div class="loading-indicator">
                  <Truck size={12} />
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>
    
    <!-- Right: Schedule List -->
    <div class="schedule-section">
      <div class="schedule-header">
        <h3>{selectedDate ? `Schedule for ${selectedDate}` : 'Select a date'}</h3>
        {#if selectedDate && selectedDayOrders.length > 0}
          <span class="order-badge">{selectedDayOrders.length} {selectedDayOrders.length === 1 ? 'order' : 'orders'}</span>
        {/if}
      </div>
      
      {#if selectedDate && selectedLoadingDay}
        <div class="loading-day-info">
          <Truck size={16} />
          <span>Loading Day</span>
          {#if selectedLoadingDay.carrier}
            <span class="carrier-badge">{selectedLoadingDay.carrier}</span>
          {/if}
        </div>
      {/if}
      
      <div class="schedule-body">
        {#if selectedDate}
          {#if selectedDayOrders.length === 0}
            <div class="empty-state">
              <Calendar size={48} />
              <p>No orders scheduled for this date</p>
              <button class="btn-secondary" on:click={openAddOrderModal}>
                <Plus size={18} />
                Add Order to Schedule
              </button>
            </div>
          {:else}
            <div class="orders-list">
              {#each selectedDayOrders as order}
                <div class="order-card">
                  <div class="order-header">
                    <span class="order-id">{order.poNumber || order.id}</span>
                    <div class="order-actions">
                      <button class="btn-icon-sm" on:click={() => removeOrderFromLoadingDate(order.id)} title="Remove from schedule">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <h4 class="order-title">{order.title}</h4>
                  <div class="order-meta">
                    <span class="meta-item">Client: {order.client}</span>
                    <span class="meta-item">Due: {order.due}</span>
                  </div>
                </div>
              {/each}
            </div>
            <button class="btn-secondary add-more-btn" on:click={openAddOrderModal}>
              <Plus size={16} />
              Add More Orders
            </button>
          {/if}
        {:else}
          <div class="empty-state">
            <Calendar size={48} />
            <p>Select a date to view scheduled orders</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
  
  <!-- Bottom: All Orders -->
  <div class="all-orders-section">
    <div class="section-header">
      <h3>All Orders</h3>
      <div class="filter-group">
        <button
          class="filter-btn"
          class:active={filterStatus === 'all'}
          on:click={() => filterStatus = 'all'}
        >
          All ({orders.length})
        </button>
        <button
          class="filter-btn"
          class:active={filterStatus === 'scheduled'}
          on:click={() => filterStatus = 'scheduled'}
        >
          Scheduled ({orders.filter(o => o.loadingDate).length})
        </button>
        <button
          class="filter-btn"
          class:active={filterStatus === 'unscheduled'}
          on:click={() => filterStatus = 'unscheduled'}
        >
          Unscheduled ({orders.filter(o => !o.loadingDate).length})
        </button>
      </div>
    </div>
    
    <div class="orders-table">
      {#each filteredOrders.slice(0, 10) as order}
        <div class="table-row">
          <span class="col-po">{order.id}</span>
          <span class="col-client">{order.client}</span>
          <span class="col-title">{order.title}</span>
          <span class="col-due">{order.due}</span>
          <span class="col-loading">{order.loadingDate || '—'}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- Add Order Modal -->
{#if showAddOrderModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={() => showAddOrderModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="add-order-title">
      <div class="modal-header">
        <h3 id="add-order-title">Add Order to {selectedDate}</h3>
        <button class="btn-icon" on:click={() => showAddOrderModal = false} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div class="modal-body">
        {#if availableOrders.length === 0}
          <p class="empty-text">No unscheduled orders available</p>
        {:else}
          <div class="available-orders">
            {#each availableOrders as order}
              <button class="available-order" on:click={() => assignOrderToLoadingDate(order.id)}>
                <div class="order-info">
                  <span class="order-po">{order.poNumber || order.id}</span>
                  <span class="order-client">{order.client}</span>
                </div>
                <span class="order-due">Due: {order.due}</span>
                <Check size={18} class="add-icon" />
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- New Loading Day Modal -->
{#if showNewLoadingDayModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={() => showNewLoadingDayModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="loading-day-title">
      <div class="modal-header">
        <h3 id="loading-day-title">Mark Loading Day - {selectedDate}</h3>
        <button class="btn-icon" on:click={() => showNewLoadingDayModal = false} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="carrier">Carrier (optional)</label>
          <input type="text" id="carrier" bind:value={newLoadingDayCarrier} placeholder="e.g., DPD, DHL, Own transport" />
        </div>
        <div class="form-group">
          <label for="note">Note (optional)</label>
          <textarea id="note" bind:value={newLoadingDayNote} placeholder="Any special instructions..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" on:click={() => showNewLoadingDayModal = false}>{$t('actions.cancel', { default: 'Cancel' })}</button>
        <button class="btn-secondary" on:click={createLoadingDay}>
          <Truck size={16} />
          Create Loading Day
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .calendar-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--bg-0);
    min-height: 100vh;
  }
  
  /* Top Bar */
  .calendar-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  
  .topbar-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  
  .topbar-left h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text);
  }
  
  .topbar-right {
    display: flex;
    gap: var(--space-sm);
  }
  
  .btn-secondary, .btn-ghost {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid var(--border);
    background: var(--bg-1);
    color: var(--text);
  }
  
  .btn-secondary {
    background: var(--accent-1);
    color: white;
    border-color: var(--accent-1);
  }
  
  .btn-secondary:hover {
    background: color-mix(in oklab, var(--accent-1) 90%, black);
  }
  
  .btn-ghost:hover {
    background: var(--bg-2);
  }
  
  .btn-ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Main Grid */
  .calendar-grid {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: var(--space-lg);
    align-items: start;
  }
  
  .calendar-section, .schedule-section {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }
  
  /* Calendar */
  .calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }
  
  .month-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text);
  }
  
  .nav-btn {
    padding: var(--space-xs);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: background 0.2s ease;
  }
  
  .nav-btn:hover {
    background: var(--bg-2);
  }
  
  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }
  
  .weekday {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: var(--space-xs);
  }
  
  .days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--space-xs);
  }
  
  .day-cell {
    aspect-ratio: 1;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-0);
    color: var(--text);
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xs);
  }
  
  .day-cell:hover {
    background: var(--bg-2);
    border-color: var(--accent-1);
  }
  
  .day-cell.other-month {
    opacity: 0.3;
  }
  
  .day-cell.today {
    border-color: var(--accent-1);
    border-width: 2px;
    font-weight: 600;
  }
  
  .day-cell.selected {
    background: var(--accent-1);
    color: white;
    border-color: var(--accent-1);
  }
  
  .day-cell.has-loading {
    background: color-mix(in oklab, var(--accent-1) 10%, var(--bg-0));
  }
  
  .day-number {
    font-size: 0.875rem;
  }
  
  .order-count {
    position: absolute;
    top: 4px;
    right: 4px;
    background: var(--accent-1);
    color: white;
    font-size: 0.625rem;
    padding: 2px 4px;
    border-radius: 999px;
    font-weight: 600;
    min-width: 16px;
    text-align: center;
  }
  
  .day-cell.selected .order-count {
    background: white;
    color: var(--accent-1);
  }
  
  .loading-indicator {
    position: absolute;
    bottom: 4px;
    right: 4px;
    color: var(--accent-1);
  }
  
  /* Schedule Section */
  .schedule-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--border);
  }
  
  .schedule-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
  }
  
  .order-badge {
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-2);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
  }
  
  .schedule-body {
    min-height: 400px;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl);
    color: var(--muted);
    gap: var(--space-md);
  }
  
  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
  }
  
  .orders-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  
  .order-card {
    padding: var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-0);
    transition: all 0.2s ease;
  }
  
  .order-card:hover {
    border-color: var(--accent-1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .order-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }
  
  .order-id {
    font-weight: 600;
    color: var(--accent-1);
  }
  
  .order-badges {
    display: flex;
    gap: var(--space-xs);
  }
  
  .badge-text {
    font-size: 0.65rem;
  }
  
  .order-title {
    margin: 0 0 var(--space-sm) 0;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text);
  }
  
  .order-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
  }
  
  .meta-item {
    font-size: 0.75rem;
    color: var(--muted);
  }
  
  /* All Orders Section */
  .all-orders-section {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }
  
  .section-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text);
  }
  
  .filter-group {
    display: flex;
    gap: var(--space-xs);
  }
  
  .filter-btn {
    padding: var(--space-xs) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }
  
  .filter-btn:hover {
    background: var(--bg-2);
  }
  
  .filter-btn.active {
    background: var(--accent-1);
    color: white;
    border-color: var(--accent-1);
  }
  
  .orders-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  
  .table-row {
    display: grid;
    grid-template-columns: 120px 180px 1fr 120px 120px;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-0);
    font-size: 0.875rem;
  }
  
  .col-po {
    font-weight: 600;
    color: var(--accent-1);
  }
  
  .col-client, .col-title {
    color: var(--text);
  }
  
  .col-due, .col-loading {
    color: var(--muted);
  }
  
  @media (max-width: 1280px) {
    .calendar-grid {
      grid-template-columns: 1fr;
    }
    
    .schedule-section {
      order: -1;
    }
  }
  
  @media (max-width: 768px) {
    .calendar-topbar {
      flex-direction: column;
      gap: var(--space-md);
    }
    
    .topbar-left, .topbar-right {
      width: 100%;
      justify-content: space-between;
    }
    
    .table-row {
      grid-template-columns: 1fr;
      gap: var(--space-xs);
    }
  }

  /* Loading Day Info */
  .loading-day-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: color-mix(in oklab, var(--accent-1) 15%, var(--bg-1));
    border: 1px solid var(--accent-1);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
    font-size: 0.875rem;
    color: var(--accent-1);
    font-weight: 500;
  }

  .carrier-badge {
    padding: 2px 8px;
    background: var(--accent-1);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
  }

  .add-more-btn {
    margin-top: var(--space-md);
    width: 100%;
    justify-content: center;
  }

  .order-actions {
    display: flex;
    gap: var(--space-xs);
  }

  .btn-icon-sm {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--muted);
    transition: all 0.15s;
  }

  .btn-icon-sm:hover {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 480px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .modal-body {
    padding: var(--space-lg);
    overflow-y: auto;
    flex: 1;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--muted);
    transition: all 0.15s;
  }

  .btn-icon:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .available-orders {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .available-order {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .available-order:hover {
    border-color: var(--accent-1);
    background: color-mix(in oklab, var(--accent-1) 5%, var(--bg-0));
  }

  .available-order .order-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .available-order .order-po {
    font-weight: 600;
    color: var(--text);
  }

  .available-order .order-client {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .available-order .order-due {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .available-order :global(.add-icon) {
    color: var(--success, #22c55e);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .available-order:hover :global(.add-icon) {
    opacity: 1;
  }

  .empty-text {
    text-align: center;
    color: var(--muted);
    padding: var(--space-xl);
  }

  .form-group {
    margin-bottom: var(--space-md);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--space-xs);
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--text);
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-0);
    color: var(--text);
    font-size: 0.875rem;
  }

  .form-group textarea {
    min-height: 80px;
    resize: vertical;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--accent-1);
  }
</style>
