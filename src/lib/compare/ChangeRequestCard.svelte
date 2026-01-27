<!-- src/lib/compare/ChangeRequestCard.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { ChangeRequest } from '$lib/stores/changeRequests';
    
    export let request: ChangeRequest;
    export let canReview = false;

    const dispatch = createEventDispatcher<{
        approve: string;
        reject: string;
    }>();

    function formatValue(value: any): string {
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    }
</script>

<article class="change-request" data-status={request.status}>
    <header>
        <h3>Change Request</h3>
        <span class="status-badge" data-status={request.status}>
            {request.status}
        </span>
    </header>

    <div class="changes">
        <h4>Proposed Changes</h4>
        {#each request.changes as change}
            <div class="change-item">
                <strong>{change.field}:</strong>
                <div class="change-diff">
                    <div class="old-value">
                        <span class="label">Old:</span>
                        <code>{formatValue(change.old_value)}</code>
                    </div>
                    <div class="arrow">→</div>
                    <div class="new-value">
                        <span class="label">New:</span>
                        <code>{formatValue(change.new_value)}</code>
                    </div>
                </div>
            </div>
        {/each}
    </div>

    {#if request.reason}
        <div class="reason">
            <strong>Reason:</strong>
            <p>{request.reason}</p>
        </div>
    {/if}

    {#if canReview && request.status === 'pending'}
        <footer class="actions">
            <button
                class="btn-approve"
                on:click={() => dispatch('approve', request.id)}
                aria-label="Approve change request"
            >
                Approve
            </button>
            <button
                class="btn-reject"
                on:click={() => dispatch('reject', request.id)}
                aria-label="Reject change request"
            >
                Reject
            </button>
        </footer>
    {/if}
</article>

<style>
    .change-request {
        border: 2px solid var(--border, #ddd);
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1rem;
        background: var(--bg-1, #fff);
    }

    .change-request[data-status="approved"] {
        border-color: var(--ok, #28a745);
        background: var(--bg-0, #f0fff4);
    }

    .change-request[data-status="rejected"] {
        border-color: var(--danger, #dc3545);
        background: var(--bg-0, #fff5f5);
    }

    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    h3 {
        margin: 0;
        font-size: 1.25rem;
    }

    .status-badge {
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .status-badge[data-status="pending"] {
        background: var(--warn, #ffc107);
        color: #000;
    }

    .status-badge[data-status="approved"] {
        background: var(--ok, #28a745);
        color: #fff;
    }

    .status-badge[data-status="rejected"] {
        background: var(--danger, #dc3545);
        color: #fff;
    }

    .changes {
        margin: 1rem 0;
    }

    .change-item {
        margin-bottom: 1rem;
        padding: 1rem;
        background: var(--bg-0, #f8f9fa);
        border-radius: 4px;
    }

    .change-diff {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 1rem;
        margin-top: 0.5rem;
    }

    .old-value code {
        color: var(--danger, #dc3545);
        text-decoration: line-through;
    }

    .new-value code {
        color: var(--ok, #28a745);
        font-weight: 600;
    }

    code {
        display: block;
        padding: 0.5rem;
        background: white;
        border: 1px solid var(--border, #ddd);
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        white-space: pre-wrap;
    }

    .arrow {
        display: flex;
        align-items: center;
        font-size: 1.5rem;
        color: var(--muted, #666);
    }

    .actions {
        display: flex;
        gap: 1rem;
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border, #ddd);
    }

    button {
        padding: 0.5rem 1.5rem;
        border: none;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    button:focus-visible {
        outline: 3px solid var(--focus, #ffd700);
        outline-offset: 2px;
    }

    .btn-approve {
        background: var(--ok, #28a745);
        color: white;
    }

    .btn-approve:hover {
        background: #218838;
    }

    .btn-reject {
        background: var(--danger, #dc3545);
        color: white;
    }

    .btn-reject:hover {
        background: #c82333;
    }

    @media (prefers-reduced-motion: reduce) {
        button {
            transition: none;
        }
    }

    @media (max-width: 768px) {
        .change-diff {
            grid-template-columns: 1fr;
        }

        .arrow {
            transform: rotate(90deg);
            justify-content: center;
        }
    }
</style>