<!-- src/lib/components/production/StationBoard.svelte -->
<script lang="ts">
    import Badge from '$lib/components/ui/Badge.svelte';
    import Card from '$lib/components/ui/Card.svelte';

    let {
        station,
        orders = [],
        onorderclick,
        onstatuschange
    }: {
        station: string;
        orders?: Array<{
            id: string;
            title: string;
            client: string;
            status: string;
            dueDate: string;
            priority?: 'high' | 'medium' | 'low';
        }>;
        onorderclick?: (data: { orderId: string; station: string }) => void;
        onstatuschange?: (data: { orderId: string; station: string; status: string }) => void;
    } = $props();

    function getStatusColor(status: string): string {
        const map: Record<string, string> = {
            'NOT_STARTED': 'var(--ink-3)',
            'IN_PROGRESS': 'var(--brand)',
            'COMPLETED':   'var(--ok)',
            'BLOCKED':     'var(--error)',
            'SKIPPED':     'var(--warn)'
        };
        return map[status] || 'var(--ink-3)';
    }

    function getPriorityVariant(priority?: string): 'danger' | 'warning' | 'info' {
        if (priority === 'high') return 'danger';
        if (priority === 'medium') return 'warning';
        return 'info';
    }

    function handleOrderClick(orderId: string) {
        onorderclick?.({ orderId, station });
    }

    function handleStatusChange(orderId: string, newStatus: string) {
        onstatuschange?.({ orderId, station, status: newStatus });
    }
</script>

<div class="station-board">
    <div class="station-header">
        <h2 class="station-title">{station}</h2>
        <Badge variant="neutral">{orders.length} orders</Badge>
    </div>

    <div class="orders-list">
        {#each orders as order (order.id)}
            <Card padding="md" hoverable clickable onclick={() => handleOrderClick(order.id)}>
                <div class="order-item">
                    <div class="order-main">
                        <div class="order-header-row">
                            <h3 class="order-title">{order.title}</h3>
                            {#if order.priority}
                                <Badge variant={getPriorityVariant(order.priority)} size="sm">
                                    {order.priority}
                                </Badge>
                            {/if}
                        </div>
                        <p class="order-client">{order.client}</p>
                        <p class="order-due">Due: {new Date(order.dueDate).toLocaleDateString()}</p>
                    </div>

                    <div class="order-actions">
                        <select
                            class="status-select"
                            value={order.status}
                            onchange={(e) => handleStatusChange(order.id, e.currentTarget.value)}
                            onclick={(e) => e.stopPropagation()}
                            style="border-color: {getStatusColor(order.status)}"
                        >
                            <option value="NOT_STARTED">Not Started</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="BLOCKED">Blocked</option>
                            <option value="SKIPPED">Skipped</option>
                        </select>
                    </div>
                </div>
            </Card>
        {:else}
            <div class="empty-station">
                <p>No orders for this station</p>
            </div>
        {/each}
    </div>
</div>

<style>
    .station-board {
        background: var(--bg-1);
        border: 2px solid var(--color-border, var(--border));
        border-radius: 0.5rem;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .station-header {
        padding: 1rem;
        background: linear-gradient(135deg, var(--brand) 0%, color-mix(in oklab, var(--brand) 75%, black) 100%);
        color: var(--bg-0);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .station-title {
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0;
    }

    .orders-list {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        flex: 1;
        overflow-y: auto;
    }

    .order-item {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
    }

    .order-main {
        flex: 1;
        min-width: 0;
    }

    .order-header-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
    }

    .order-title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }

    .order-client {
        font-size: 0.875rem;
        color: var(--color-gray-600, var(--ink-tertiary));
        margin: 0.25rem 0;
    }

    .order-due {
        font-size: 0.75rem;
        color: var(--color-gray-500, var(--muted));
        margin: 0;
    }

    .order-actions {
        display: flex;
        align-items: center;
    }

    .status-select {
        padding: 0.5rem;
        border: 2px solid;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        background: var(--bg-1);
        transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    }

    .status-select:hover {
        opacity: 0.8;
    }

    .status-select:focus {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 10%, transparent);
    }

    .empty-station {
        padding: 3rem 1rem;
        text-align: center;
        color: var(--color-gray-500, var(--muted));
    }

    @media (max-width: 768px) {
        .order-item {
            flex-direction: column;
        }

        .order-actions {
            width: 100%;
        }

        .status-select {
            width: 100%;
        }
    }
</style>