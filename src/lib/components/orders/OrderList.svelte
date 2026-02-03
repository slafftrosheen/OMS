<!-- src/lib/components/orders/OrderList.svelte -->
<script lang="ts">
    import { ordersStore as orders, filteredOrders, orderStats } from '$lib/stores/orders';
    import OrderCard from './OrderCard.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import Badge from '$lib/components/ui/Badge.svelte';
    import type { Order } from '$lib/stores/orders';

    let { 
        showFilters = true, 
        showStats = true,
        onorderClick,
        onorderEdit,
        onorderDelete
    }: {
        showFilters?: boolean;
        showStats?: boolean;
        onorderClick?: (order: Order) => void;
        onorderEdit?: (order: Order) => void;
        onorderDelete?: (order: Order) => void;
    } = $props();

    let searchQuery = $state('');
    let selectedStatuses: string[] = $state([]);
    let sortField: 'created_at' | 'due_date' | 'title' | 'status' = $state('created_at');
    let sortDirection: 'asc' | 'desc' = $state('desc');

    const STATUS_OPTIONS = [
        { value: 'ACTIVE', label: 'Active', variant: 'info' },
        { value: 'COMPLETED', label: 'Completed', variant: 'success' },
        { value: 'ON_HOLD', label: 'On Hold', variant: 'warning' },
        { value: 'CANCELLED', label: 'Cancelled', variant: 'danger' },
        { value: 'DRAFT', label: 'Draft', variant: 'neutral' }
    ] as const;

    const SORT_OPTIONS = [
        { value: 'created_at', label: 'Created Date' },
        { value: 'due_date', label: 'Due Date' },
        { value: 'title', label: 'Title' },
        { value: 'status', label: 'Status' }
    ];

    $effect(() => {
        orders.setFilters({
            search: searchQuery,
            status: selectedStatuses.length > 0 ? selectedStatuses : undefined
        });
        orders.setSort({ field: sortField, direction: sortDirection });
    });

    function toggleStatus(status: string) {
        if (selectedStatuses.includes(status)) {
            selectedStatuses = selectedStatuses.filter(s => s !== status);
        } else {
            selectedStatuses = [...selectedStatuses, status];
        }
    }

    function clearFilters() {
        searchQuery = '';
        selectedStatuses = [];
        sortField = 'created_at';
        sortDirection = 'desc';
    }

    function handleOrderClick(order: Order) {
        onorderClick?.(order);
    }

    function handleOrderEdit(order: Order) {
        onorderEdit?.(order);
    }

    function handleOrderDelete(order: Order) {
        onorderDelete?.(order);
    }
</script>

<div class="order-list-container">
    {#if showStats}
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">{$orderStats.total}</div>
                <div class="stat-label">Total Orders</div>
            </div>
            <div class="stat-card stat-active">
                <div class="stat-value">{$orderStats.active}</div>
                <div class="stat-label">Active</div>
            </div>
            <div class="stat-card stat-completed">
                <div class="stat-value">{$orderStats.completed}</div>
                <div class="stat-label">Completed</div>
            </div>
            <div class="stat-card stat-overdue">
                <div class="stat-value">{$orderStats.overdue}</div>
                <div class="stat-label">Overdue</div>
            </div>
        </div>
    {/if}

    {#if showFilters}
        <div class="filters-section">
            <div class="search-bar">
                <Input
                    type="search"
                    bind:value={searchQuery}
                    placeholder="Search orders by title, client, or description..."
                    icon="🔍"
                    iconPosition="left"
                    fullWidth
                />
            </div>

            <div class="filter-row">
                <div class="status-filters">
                    <span class="filter-label">Status:</span>
                    {#each STATUS_OPTIONS as option}
                        <button
                            class="status-filter"
                            class:active={selectedStatuses.includes(option.value)}
                            on:click={() => toggleStatus(option.value)}
                        >
                            <Badge variant={option.variant} size="sm">
                                {option.label}
                            </Badge>
                        </button>
                    {/each}
                </div>

                <div class="sort-controls">
                    <label for="sort-field" class="filter-label">Sort by:</label>
                    <select id="sort-field" bind:value={sortField} class="sort-select">
                        {#each SORT_OPTIONS as option}
                            <option value={option.value}>{option.label}</option>
                        {/each}
                    </select>
                    
                    <button
                        class="sort-direction"
                        on:click={() => sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'}
                        title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortDirection === 'asc' ? '↑' : '↓'}
                    </button>
                </div>

                {#if searchQuery || selectedStatuses.length > 0}
                    <button class="clear-filters" on:click={clearFilters}>
                        Clear Filters
                    </button>
                {/if}
            </div>
        </div>
    {/if}

    <div class="orders-grid">
        {#if $orders.loading}
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Loading orders...</p>
            </div>
        {:else if $orders.error}
            <div class="error-state">
                <p class="error-message">⚠️ {$orders.error}</p>
            </div>
        {:else if $filteredOrders.length === 0}
            <div class="empty-state">
                {#if searchQuery || selectedStatuses.length > 0}
                    <p class="empty-message">No orders match your filters</p>
                    <button class="clear-filters-btn" on:click={clearFilters}>
                        Clear Filters
                    </button>
                {:else}
                    <p class="empty-message">No orders yet</p>
                    <p class="empty-hint">Create your first order to get started</p>
                {/if}
            </div>
        {:else}
            {#each $filteredOrders as order (order.id)}
                <OrderCard
                    {order}
                    onclick={handleOrderClick}
                    onedit={handleOrderEdit}
                    ondelete={handleOrderDelete}
                />
            {/each}
        {/if}
    </div>

    {#if $filteredOrders.length > 0}
        <div class="list-footer">
            <p class="result-count">
                Showing {$filteredOrders.length} of {$orders.total} order{$orders.total !== 1 ? 's' : ''}
            </p>
        </div>
    {/if}
</div>

<style>
    .order-list-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
    }

    .stat-card {
        background: white;
        padding: 1.5rem;
        border-radius: 0.5rem;
        border: 1px solid var(--color-border, #e5e7eb);
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    }

    .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--color-text, #111827);
        margin-bottom: 0.25rem;
    }

    .stat-label {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        font-weight: 500;
    }

    .stat-active .stat-value { color: #3b82f6; }
    .stat-completed .stat-value { color: #10b981; }
    .stat-overdue .stat-value { color: #ef4444; }

    .filters-section {
        background: white;
        padding: 1.25rem;
        border-radius: 0.5rem;
        border: 1px solid var(--color-border, #e5e7eb);
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .search-bar {
        width: 100%;
    }

    .filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
    }

    .status-filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
    }

    .filter-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-gray-700, #374151);
    }

    .status-filter {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        opacity: 0.5;
        transition: opacity 0.15s ease;
    }

    .status-filter:hover,
    .status-filter.active {
        opacity: 1;
    }

    .sort-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .sort-select {
        padding: 0.375rem 0.75rem;
        border: 1px solid var(--color-border, #d1d5db);
        border-radius: 0.375rem;
        font-size: 0.875rem;
        background: white;
        cursor: pointer;
    }

    .sort-direction {
        padding: 0.375rem 0.75rem;
        border: 1px solid var(--color-border, #d1d5db);
        border-radius: 0.375rem;
        background: white;
        cursor: pointer;
        font-size: 1.25rem;
        line-height: 1;
        transition: all 0.15s ease;
    }

    .sort-direction:hover {
        background-color: var(--color-gray-50, #f9fafb);
    }

    .clear-filters,
    .clear-filters-btn {
        padding: 0.5rem 1rem;
        border: 1px solid var(--color-border, #d1d5db);
        border-radius: 0.375rem;
        background: white;
        color: var(--color-gray-700, #374151);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .clear-filters:hover,
    .clear-filters-btn:hover {
        background-color: var(--color-gray-50, #f9fafb);
        border-color: var(--color-gray-300, #d1d5db);
    }

    .orders-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 1rem;
    }

    .loading-state,
    .error-state,
    .empty-state {
        grid-column: 1 / -1;
        padding: 3rem;
        text-align: center;
    }

    .spinner {
        width: 3rem;
        height: 3rem;
        border: 4px solid var(--color-gray-200, #e5e7eb);
        border-top-color: var(--color-primary, #0066cc);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 1rem;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .error-message {
        color: var(--color-danger, #dc3545);
        font-size: 1rem;
    }

    .empty-message {
        font-size: 1.125rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0 0 0.5rem 0;
    }

    .empty-hint {
        font-size: 0.875rem;
        color: var(--color-gray-500, #9ca3af);
        margin: 0;
    }

    .list-footer {
        padding: 1rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
        text-align: center;
    }

    .result-count {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
    }

    @media (max-width: 768px) {
        .orders-grid {
            grid-template-columns: 1fr;
        }

        .filter-row {
            flex-direction: column;
            align-items: stretch;
        }

        .status-filters,
        .sort-controls {
            width: 100%;
        }

        .stats-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>