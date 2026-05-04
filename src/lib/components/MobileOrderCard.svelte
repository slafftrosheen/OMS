<script lang="ts">
    import { Calendar, User, AlertCircle, ChevronRight } from "lucide-svelte";
    import type { Order } from "$lib/stores/orders";

    let { order }: { order: Order } = $props();

    function formatDate(date: string) {
        return new Date(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    }

    function getStatusColor(status: string) {
        const colors: Record<string, string> = {
            pending:     "var(--warn)",
            draft:       "var(--ink-3)",
            active:      "var(--link)",
            in_progress: "var(--link)",
            completed:   "var(--ok)",
            cancelled:   "var(--error)",
            on_hold:     "var(--warn)",
        };
        return colors[status] || "var(--ink-3)";
    }

    function getPriorityLabel(priority: number) {
        if (priority >= 8) return { label: "High",   color: "var(--error)" };
        if (priority >= 5) return { label: "Medium", color: "var(--warn)"  };
        return                 { label: "Low",    color: "var(--ok)"     };
    }

    let priority = $derived(getPriorityLabel(order.priority));
    // Adapting fields to match src/lib/stores/orders.ts
    let progress = $derived(order.progress_percentage || 0);
    let customer = $derived(order.client);
    let code = $derived(order.po_number);
    // Fallback for assignee since it's not in Order interface
    let assigneeName = $derived(
        (order as any).assigned_to_name ||
            (order as any).assigned_to ||
            (order.assignee_count ? `${order.assignee_count} Assignees` : null),
    );
</script>

<a href="/orders/{order.id}" class="mobile-order-card">
    <div class="card-header">
        <div class="order-info">
            <h3 class="order-code">{code}</h3>
            <span
                class="status-badge"
                style="background-color: {getStatusColor(
                    order.status,
                )}20; color: {getStatusColor(order.status)}"
            >
                {order.status.replace("_", " ")}
            </span>
        </div>
        <ChevronRight size={20} class="chevron" />
    </div>

    <div class="card-body">
        <p class="customer-name">{customer}</p>

        <div class="progress-section">
            <div class="progress-bar-container">
                <div
                    class="progress-bar-fill"
                    style="width: {progress}%; background-color: {getStatusColor(
                        order.status,
                    )}"
                ></div>
            </div>
            <span class="progress-text">{Math.round(progress)}%</span>
        </div>

        <div class="meta-info">
            {#if order.due_date}
                <div class="meta-item">
                    <Calendar size={14} />
                    <span>{formatDate(order.due_date)}</span>
                </div>
            {/if}

            {#if assigneeName}
                <div class="meta-item">
                    <User size={14} />
                    <span>{assigneeName}</span>
                </div>
            {/if}

            <div class="meta-item priority" style="color: {priority.color}">
                <AlertCircle size={14} />
                <span>{priority.label}</span>
            </div>
        </div>
    </div>
</a>

<style>
    .mobile-order-card {
        display: block;
        background: var(--bg-1);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 15px;
        text-decoration: none;
        color: inherit;
        transition: all 0.2s;
    }

    .mobile-order-card:active {
        transform: scale(0.98);
        box-shadow: 0 2px 8px color-mix(in oklab, var(--bg-0) 10%, transparent);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
    }

    .order-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .order-code {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--ink-primary);
    }

    .status-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: capitalize;
        width: fit-content;
    }

    /* Using :global to avoid unused selector warning if component is unused,
       but here it is used. The warning might be because Lucide icon classes are internal.
       Actually, I'll just remove the specific class styling if it's simple color change */
    :global(.chevron) {
        color: var(--muted);
        flex-shrink: 0;
    }

    .card-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .customer-name {
        margin: 0;
        font-size: 0.938rem;
        color: var(--ink-secondary);
    }

    .progress-section {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .progress-bar-container {
        flex: 1;
        height: 6px;
        background: var(--border);
        border-radius: 3px;
        overflow: hidden;
    }

    .progress-bar-fill {
        height: 100%;
        transition: width 0.3s ease;
    }

    .progress-text {
        font-size: 0.813rem;
        font-weight: 600;
        color: var(--ink-tertiary);
        min-width: 35px;
        text-align: right;
    }

    .meta-info {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
    }

    .meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.813rem;
        color: var(--ink-tertiary);
    }

    .meta-item.priority {
        font-weight: 500;
    }
</style>
