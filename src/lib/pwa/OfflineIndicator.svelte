<script lang="ts">
/**
 * Enhanced Offline Mode Indicator Component
 * Shows online/offline status, pending sync queue, and conflicts
 */

import { syncStatus, syncQueue, syncNow } from '$lib/pwa/sync-manager';
import Icon from '$lib/ui/Icon.svelte';

let showDetails = $state(false);

function handleSync() {
    syncNow();
}

function toggleDetails() {
    showDetails = !showDetails;
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleDetails();
    }
}
</script>

<div class="offline-indicator" class:offline={!$syncStatus.online}>
    <button 
        class="status-btn" 
        onclick={toggleDetails}
        onkeydown={handleKeydown}
        aria-expanded={showDetails}
        aria-label={$syncStatus.online ? 'Online status' : 'Offline status'}
    >
        {#if $syncStatus.online}
            <Wifi size={16} />
        {:else}
            <WifiOff size={16} />
        {/if}
        
        {#if $syncStatus.queueLength > 0}
            <span class="badge">{$syncStatus.queueLength}</span>
        {/if}
        
        {#if $syncStatus.conflicts > 0}
            <AlertCircle size={14} class="conflict-icon" />
        {/if}
    </button>

    {#if showDetails}
        <div class="details-panel">
            <div class="detail-row">
                <span>Status:</span>
                <strong class:online={$syncStatus.online} class:offline={!$syncStatus.online}>
                    {$syncStatus.online ? 'Online' : 'Offline'}
                </strong>
            </div>
            
            <div class="detail-row">
                <span>Pending Changes:</span>
                <strong>{$syncStatus.queueLength}</strong>
            </div>
            
            {#if $syncStatus.conflicts > 0}
                <div class="detail-row warning">
                    <span>Conflicts:</span>
                    <strong>{$syncStatus.conflicts}</strong>
                </div>
            {/if}
            
            {#if $syncStatus.lastSync}
                <div class="detail-row">
                    <span>Last Sync:</span>
                    <small>{new Date($syncStatus.lastSync).toLocaleTimeString()}</small>
                </div>
            {/if}
            
            {#if $syncStatus.queueLength > 0 && $syncStatus.online}
                <button 
                    class="sync-btn" 
                    onclick={handleSync}
                    disabled={$syncStatus.syncing}
                >
                    <RefreshCw size={14} class={$syncStatus.syncing ? 'spinning' : ''} />
                    {$syncStatus.syncing ? 'Syncing...' : 'Sync Now'}
                </button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .offline-indicator {
        position: fixed;
        top: 70px;
        right: 20px;
        z-index: var(--z-modal);
    }

    .status-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: var(--ok);
        color: var(--bg-0);
        border: none;
        border-radius: 20px;
        cursor: pointer;
        box-shadow: 0 2px 8px color-mix(in oklab, var(--bg-0) 15%, transparent);
        transition: all 0.2s;
    }

    .offline .status-btn {
        background: var(--error);
    }

    .status-btn:hover {
        transform: scale(1.05);
    }

    .badge {
        position: absolute;
        top: -6px;
        right: -6px;
        background: var(--warn);
        color: var(--bg-0);
        font-size: 0.75rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 20px;
        text-align: center;
    }

    :global(.conflict-icon) {
        color: color-mix(in oklab, var(--warn) 75%, var(--bg-0));
    }

    .details-panel {
        position: absolute;
        top: 45px;
        right: 0;
        background: white;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 10%, transparent);
        min-width: 220px;
        animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        font-size: 0.875rem;
    }

    .detail-row:not(:last-child) {
        border-bottom: 1px solid var(--bg-2);
    }

    .detail-row.warning {
        color: var(--warn);
    }

    .detail-row strong.online {
        color: var(--ok);
    }

    .detail-row strong.offline {
        color: var(--error);
    }

    .sync-btn {
        width: 100%;
        margin-top: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px;
        background: var(--brand);
        color: var(--bg-0);
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }

    .sync-btn:hover:not(:disabled) {
        background: var(--brand);
    }

    .sync-btn:disabled {
        background: var(--muted);
        cursor: not-allowed;
    }

    :global(.spinning) {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>