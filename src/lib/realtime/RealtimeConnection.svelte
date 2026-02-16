<script lang="ts">
/**
 * Realtime Connection Component
 * Manages WebSocket connection lifecycle and displays connection status
 * Auto-connects when user is authenticated
 */

import { onMount, onDestroy } from 'svelte';
import { realtimeService, connectionState } from './realtime-service';
import { currentUser } from '$lib/auth/authState.svelte';
import { Wifi, WifiOff, AlertCircle } from 'lucide-svelte';

let unsubscribe: (() => void) | null = null;
let userId: string | null = null;

onMount(() => {
  // Subscribe to user state
  const userUnsub = currentUser.subscribe(user => {
    if (user?.id && user.id !== userId) {
      userId = user.id;
      connectRealtime();
    } else if (!user && userId) {
      disconnectRealtime();
      userId = null;
    }
  });

  // Request notification permission
  realtimeService.requestNotificationPermission().catch(console.error);

  return () => {
    userUnsub();
  };
});

onDestroy(() => {
  disconnectRealtime();
});

async function connectRealtime() {
  if (userId) {
    await realtimeService.connect(userId);
  }
}

async function disconnectRealtime() {
  await realtimeService.disconnect();
}

async function retryConnection() {
  if (userId) {
    await realtimeService.disconnect();
    await realtimeService.connect(userId);
  }
}

let statusIcon = $derived($connectionState === 'connected' ? Wifi :
                $connectionState === 'error' ? AlertCircle : WifiOff);
let statusColor = $derived($connectionState === 'connected' ? 'var(--ok)' :
                 $connectionState === 'error' ? 'var(--danger)' : 'var(--muted)');
let statusLabel = $derived($connectionState === 'connected' ? 'Connected' :
                 $connectionState === 'connecting' ? 'Connecting...' :
                 $connectionState === 'error' ? 'Connection Error' : 'Disconnected');

  const SvelteComponent = $derived(statusIcon);
</script>

<!-- Connection status indicator -->
<div class="realtime-status" title={statusLabel}>
  <SvelteComponent 
    size={16} 
    style="color: {statusColor}" 
    aria-label={statusLabel}
  />
  
  {#if $connectionState === 'error'}
    <button 
      class="retry-btn" 
      onclick={retryConnection}
      aria-label="Retry connection"
    >
      Retry
    </button>
  {/if}
</div>

<style>
  .realtime-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    background: var(--bg-1);
    border: 1px solid var(--border);
  }

  .retry-btn {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: var(--accent-1);
    color: var(--bg-0);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .retry-btn:hover {
    opacity: 0.8;
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>