<!-- src/lib/components/orders/OrderCard.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import Badge from '$lib/components/ui/Badge.svelte';
    import type { Order } from '$lib/stores/orders';

    export let order: Order;
    export let showActions = true;

    const dispatch = createEventDispatcher();

    $: progress = calculateProgress(order.stages);
    $: isOverdue = new Date(order.due_date) < new Date() && order.status !== 'COMPLETED';
    $: daysRemaining = Math.ceil((new Date(order.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    function calculateProgress(stages: Record<string, string>): number {
        const total = Object.keys(stages).length;
        const completed = Object.values(stages).filter(s => s === 'COMPLETED').length;
        return Math.round((completed / total) * 100);
    }

    function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
        const variants = {
            'COMPLETED': 'success',
            'ACTIVE': 'info',
            'ON_HOLD': 'warning',
            'CANCELLED': 'danger',
            'DRAFT': 'neutral'
        };
        return variants[status as keyof typeof variants] || 'neutral';
    }

    function handleClick() {
        dispatch('click', order);
    }

    function handleEdit(event: Event) {
        event.stopPropagation();
        dispatch('edit', order);
    }

    function handleDelete(event: Event) {
        event.stopPropagation();
        dispatch('delete', order);
    }
</script>

<div class="order-card" on:click={handleClick} role="button" tabindex="0" on:keypress={(e) => e.key === 'Enter' && handleClick()}>
    <div class="order-header">
        <div class="order-info">
            <h3 class="order-title">{order.title}</h3>
            <p class="order-client">
                <span class="icon">👤</span>
                {order.client}
            </p>
        </div>
        <Badge variant={getStatusVariant(order.status)}>
            {order.status.replace('_', ' ')}
        </Badge>
    </div>

    <div class="order-body">
        {#if order.description}
            <p class="order-description">{order.description.substring(0, 100)}{order.description.length > 100 ? '...' : ''}</p>
        {/if}

        <!-- Progress Bar -->
        <div class="progress-section">
            <div class="progress-header">
                <span class="progress-label">Progress</span>
                <span class="progress-value">{progress}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: {progress}%"></div>
            </div>
        </div>

        <!-- Stage Pills -->
        <div class="stages">
            {#each Object.entries(order.stages) as [stage, status]}
                <span class="stage-pill stage-{status.toLowerCase().replace('_', '-')}">
                    {stage}
                </span>
            {/each}
        </div>
    </div>

    <div class="order-footer">
        <div class="order-meta">
            <div class="meta-item" class:overdue={isOverdue}>
                <span class="icon">📅</span>
                <span class="meta-text">
                    {new Date(order.due_date).toLocaleDateString()}
                    {#if order.status === 'ACTIVE'}
                        <span class="days-remaining">
                            ({daysRemaining > 0 ? `${daysRemaining}d left` : 'Overdue'})
                        </span>
                    {/if}
                </span>
            </div>
            
            {#if order.price}
                <div class="meta-item">
                    <span class="icon">💰</span>
                    <span class="meta-text">€{order.price.toLocaleString()}</span>
                </div>
            {/if}

            {#if order.rework_count > 0}
                <div class="meta-item rework">
                    <span class="icon">🔄</span>
                    <span class="meta-text">{order.rework_count} rework{order.rework_count > 1 ? 's' : ''}</span>
                </div>
            {/if}
        </div>

        {#if showActions}
            <div class="order-actions">
                <button class="action-btn" on:click={handleEdit} title="Edit order">
                    <span aria-hidden="true">✏️</span>
                    <span class="sr-only">Edit</span>
                </button>
                <button class="action-btn danger" on:click={handleDelete} title="Delete order">
                    <span aria-hidden="true">🗑️</span>
                    <span class="sr-only">Delete</span>
                </button>
            </div>
        {/if}
    </div>
</div>

<style>
    .order-card {
        background: white;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 0.5rem;
        padding: 1.25rem;
        transition: all 0.15s ease;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .order-card:hover {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
                    0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transform: translateY(-2px);
        border-color: var(--color-primary, #0066cc);
    }

    .order-card:focus-visible {
        outline: 2px solid var(--color-primary, #0066cc);
        outline-offset: 2px;
    }

    .order-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
    }

    .order-info {
        flex: 1;
        min-width: 0;
    }

    .order-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0 0 0.25rem 0;
        color: var(--color-text, #111827);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .order-client {
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .icon {
        font-size: 1em;
    }

    .order-body {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .order-description {
        font-size: 0.875rem;
        color: var(--color-gray-700, #374151);
        margin: 0;
        line-height: 1.5;
    }

    .progress-section {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
    }

    .progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--color-gray-600, #6b7280);
    }

    .progress-bar {
        height: 0.5rem;
        background-color: var(--color-gray-200, #e5e7eb);
        border-radius: 9999px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #0066cc, #0052a3);
        transition: width 0.3s ease;
    }

    .stages {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
    }

    .stage-pill {
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-weight: 500;
        white-space: nowrap;
    }

    .stage-not-started {
        background-color: #f3f4f6;
        color: #6b7280;
    }

    .stage-in-progress {
        background-color: #dbeafe;
        color: #1e40af;
    }

    .stage-completed {
        background-color: #dcfce7;
        color: #166534;
    }

    .stage-blocked {
        background-color: #fee2e2;
        color: #991b1b;
    }

    .stage-skipped {
        background-color: #fef3c7;
        color: #92400e;
    }

    .order-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
    }

    .order-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        flex: 1;
    }

    .meta-item {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.875rem;
        color: var(--color-gray-600, #6b7280);
    }

    .meta-item.overdue {
        color: var(--color-danger, #dc3545);
        font-weight: 500;
    }

    .meta-item.rework {
        color: var(--color-warning, #f59e0b);
    }

    .meta-text {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .days-remaining {
        font-size: 0.75rem;
        font-weight: 500;
    }

    .order-actions {
        display: flex;
        gap: 0.5rem;
    }

    .action-btn {
        background: none;
        border: 1px solid var(--color-border, #e5e7eb);
        padding: 0.375rem 0.5rem;
        border-radius: 0.25rem;
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 1rem;
    }

    .action-btn:hover {
        background-color: var(--color-gray-100, #f3f4f6);
        border-color: var(--color-gray-300, #d1d5db);
    }

    .action-btn.danger:hover {
        background-color: #fee2e2;
        border-color: #fecaca;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
    }

    @media (max-width: 640px) {
        .stages {
            max-width: 100%;
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 0.25rem;
        }

        .order-footer {
            flex-direction: column;
            align-items: flex-start;
        }

        .order-actions {
            width: 100%;
            justify-content: flex-end;
        }
    }
</style>