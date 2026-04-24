<!-- src/lib/compare/ChangeRequestCard.svelte -->
<script lang="ts">
    import type { ChangeRequest } from '$lib/stores/changeRequests';
    
    let {
        request,
        canReview = false,
        onapprove,
        onreject
    }: {
        request: ChangeRequest;
        canReview?: boolean;
        onapprove?: (id: string) => void;
        onreject?: (id: string) => void;
    } = $props();

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
                onclick={() => onapprove?.(request.id)}
                aria-label="Approve change request"
            >
                Approve
            </button>
            <button
                class="btn-reject"
                onclick={() => onreject?.(request.id)}
                aria-label="Reject change request"
            >
                Reject
            </button>
        </footer>
    {/if}
</article>

<style>
    .change-request {
        border: 2px solid var(--border, var(--border));
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1rem;
        background: var(--bg-1, var(--bg-0));
    }

    .change-request[data-status="approved"] {
        border-color: var(--ok, var(--ok));
        background: var(--bg-0, var(--ok-soft));
    }

    .change-request[data-status="rejected"] {
        border-color: var(--error);
        background: var(--bg-0, var(--bg-0)5f5);
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
        background: var(--warn, var(--warn));
        color: var(--ink-primary);
    }

    .status-badge[data-status="approved"] {
        background: var(--ok, var(--ok));
        color: var(--bg-0);
    }

    .status-badge[data-status="rejected"] {
        background: var(--error);
        color: var(--bg-0);
    }

    .changes {
        margin: 1rem 0;
    }

    .change-item {
        margin-bottom: 1rem;
        padding: 1rem;
        background: var(--bg-0, var(--bg-2));
        border-radius: 4px;
    }

    .change-diff {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 1rem;
        margin-top: 0.5rem;
    }

    .old-value code {
        color: var(--error);
        text-decoration: line-through;
    }

    .new-value code {
        color: var(--ok, var(--ok));
        font-weight: 600;
    }

    code {
        display: block;
        padding: 0.5rem;
        background: white;
        border: 1px solid var(--border, var(--border));
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        white-space: pre-wrap;
    }

    .arrow {
        display: flex;
        align-items: center;
        font-size: 1.5rem;
        color: var(--muted, var(--ink-tertiary));
    }

    .actions {
        display: flex;
        gap: 1rem;
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border, var(--border));
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
        outline: 3px solid var(--focus, var(--warn));
        outline-offset: 2px;
    }

    .btn-approve {
        background: var(--ok, var(--ok));
        color: var(--bg-0);
    }

    .btn-approve:hover {
        background: color-mix(in oklab, var(--ok) 85%, black);
    }

    .btn-reject {
        background: var(--error);
        color: var(--bg-0);
    }

    .btn-reject:hover {
        background: var(--error);
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