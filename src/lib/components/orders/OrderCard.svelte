<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Order } from '$lib/stores/orders';
  import { t } from '$lib/i18n';

  export let order: Order;
  export let compact = false;
  export let showActions = true;

  const dispatch = createEventDispatcher();

  $: daysUntilDue = order.days_until_due || 0;
  $: isOverdue = daysUntilDue < 0;
  $: isDueSoon = daysUntilDue >= 0 && daysUntilDue < 3;
  $: urgencyClass = isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : '';

  $: progressColor =
    (order.progress_percentage || 0) < 30 ? 'red' :
    (order.progress_percentage || 0) < 70 ? 'orange' : 'green';

  function handleClick() {
    dispatch('click', order);
  }

  function handleEdit(e: Event) {
    e.stopPropagation();
    dispatch('edit', order);
  }

  function handleDelete(e: Event) {
    e.stopPropagation();
    if (confirm(`Delete order ${order.po_number}?`)) {
      dispatch('delete', order);
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<article
  class="order-card {urgencyClass}"
  class:compact
  on:click={handleClick}
  on:keydown={e => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <header class="card-header">
    <div class="title-section">
      <h3>{order.title}</h3>
      {#if order.po_number}
        <span class="po-number">{order.po_number}</span>
      {/if}
    </div>

    <div class="badges">
      {#if order.is_rd}
        <span class="badge badge-rd" title="R&D Order">R&D</span>
      {/if}
      {#if order.badges}
        {#each order.badges as badge}
          <span class="badge badge-{badge.toLowerCase()}">{badge}</span>
        {/each}
      {/if}
      <span class="badge badge-status badge-{order.status}">{order.status}</span>
    </div>
  </header>

  <div class="card-body">
    <div class="info-grid">
      <div class="info-item">
        <span class="label">{$t('orders.client')}:</span>
        <span class="value">{order.client}</span>
      </div>

      <div class="info-item">
        <span class="label">{$t('orders.due_date')}:</span>
        <span class="value" class:text-danger={isOverdue} class:text-warning={isDueSoon}>
          {formatDate(order.due_date)}
          {#if daysUntilDue < 0}
            <small class="text-danger">({Math.abs(daysUntilDue)}d overdue)</small>
          {:else if daysUntilDue < 7}
            <small class="text-warning">({daysUntilDue}d left)</small>
          {/if}
        </span>
      </div>

      {#if order.loading_date}
        <div class="info-item">
          <span class="label">{$t('orders.loading_date')}:</span>
          <span class="value">{formatDate(order.loading_date)}</span>
        </div>
      {/if}

      {#if !compact && order.current_station}
        <div class="info-item">
          <span class="label">{$t('orders.current_station')}:</span>
          <span class="value">
            <span class="station-badge">{order.current_station}</span>
          </span>
        </div>
      {/if}

      <div class="info-item">
        <span class="label">{$t('orders.priority')}:</span>
        <span class="value">
          <span class="priority-indicator priority-{order.priority}">
            {'★'.repeat(Math.min(order.priority, 5))}
          </span>
        </span>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="progress-section">
      <div class="progress-header">
        <span class="label">{$t('orders.progress')}:</span>
        <span class="percentage">{(order.progress_percentage || 0).toFixed(0)}%</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill progress-{progressColor}"
          style="width: {order.progress_percentage || 0}%"
          role="progressbar"
          aria-valuenow={order.progress_percentage || 0}
          aria-valuemin="0"
          aria-valuemax="100"
        />
      </div>
      <div class="progress-details">
        <small>
          {order.completed_stages || 0}/{order.total_stages || 0} stages completed
        </small>
      </div>
    </div>

    <!-- Alert Indicators -->
    {#if !compact}
      <div class="alerts">
        {#if (order.blocked_stages || 0) > 0}
          <div class="alert alert-danger">
            <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            {order.blocked_stages} blocked stage{order.blocked_stages > 1 ? 's' : ''}
          </div>
        {/if}

        {#if (order.rework_stages || 0) > 0}
          <div class="alert alert-warning">
            <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {order.rework_stages} rework needed
          </div>
        {/if}

        {#if (order.total_rework_count || 0) > 0}
          <div class="stat-badge">
            <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {order.total_rework_count} total rework{order.total_rework_count > 1 ? 's' : ''}
          </div>
        {/if}

        {#if (order.assignee_count || 0) > 0}
          <div class="stat-badge">
            <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            {order.assignee_count} assigned
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if showActions}
    <footer class="card-footer">
      <button class="btn btn-sm btn-outline" on:click={handleEdit}>
        {$t('common.edit')}
      </button>
      <button class="btn btn-sm btn-outline btn-danger" on:click={handleDelete}>
        {$t('common.delete')}
      </button>
    </footer>
  {/if}
</article>

<style>
  .order-card {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
  }

  .order-card:hover {
    border-color: var(--accent-1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .order-card:focus {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .order-card.overdue {
    border-left: 4px solid var(--danger);
  }

  .order-card.due-soon {
    border-left: 4px solid var(--warn);
  }

  .order-card.compact {
    padding: 0.75rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .title-section h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.125rem;
    color: var(--text);
  }

  .po-number {
    font-size: 0.875rem;
    color: var(--muted);
    font-family: 'Courier New', monospace;
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-rd {
    background: var(--accent-2);
    color: white;
  }

  .badge-status {
    background: var(--bg-2);
    color: var(--text);
  }

  .badge-draft { background: #6c757d; color: white; }
  .badge-active { background: #28a745; color: white; }
  .badge-completed { background: #007bff; color: white; }
  .badge-cancelled { background: #dc3545; color: white; }
  .badge-on_hold { background: #ffc107; color: black; }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item .label {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-item .value {
    font-size: 0.875rem;
    color: var(--text);
    font-weight: 500;
  }

  .text-danger { color: var(--danger); }
  .text-warning { color: var(--warn); }

  .station-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: var(--accent-1);
    color: white;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .priority-indicator {
    color: var(--warn);
    font-size: 1rem;
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .progress-header .label {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
  }

  .progress-header .percentage {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
  }

  .progress-bar {
    height: 8px;
    background: var(--bg-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    transition: width 0.3s ease;
  }

  .progress-red { background: var(--danger); }
  .progress-orange { background: var(--warn); }
  .progress-green { background: var(--ok); }

  .progress-details small {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .alerts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .alert-danger {
    background: rgba(220, 53, 69, 0.1);
    color: var(--danger);
    border: 1px solid var(--danger);
  }

  .alert-warning {
    background: rgba(255, 193, 7, 0.1);
    color: var(--warn);
    border: 1px solid var(--warn);
  }

  .stat-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--bg-2);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .icon {
    flex-shrink: 0;
  }

  .card-footer {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
  }

  .btn-outline:hover {
    background: var(--bg-2);
    border-color: var(--accent-1);
  }

  .btn-danger {
    color: var(--danger);
    border-color: var(--danger);
  }

  .btn-danger:hover {
    background: rgba(220, 53, 69, 0.1);
  }
</style>
