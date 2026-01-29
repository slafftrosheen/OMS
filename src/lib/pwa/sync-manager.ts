/**
 * Offline Sync Manager
 * Manages offline operations queue and synchronization
 */

import { writable, get } from 'svelte/store';
import { supabase } from '$lib/supabase-client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface SyncQueueItem {
  id: string;
  entityType: 'order' | 'stage' | 'comment' | 'file' | 'notification';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: string;
  retryCount: number;
  error?: string;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  queueLength: number;
  lastSync: string | null;
  conflicts: number;
}

const SYNC_QUEUE_KEY = 'oms_sync_queue';
const DEVICE_ID_KEY = 'oms_device_id';

export const syncStatus = writable<SyncStatus>({
  online: navigator.onLine,
  syncing: false,
  queueLength: 0,
  lastSync: null,
  conflicts: 0
});

export const syncQueue = writable<SyncQueueItem[]>([]);

let syncChannel: RealtimeChannel | null = null;

/**
 * Initialize sync manager
 */
export function initSyncManager() {
  // Load queue from localStorage
  loadQueue();
  
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Register service worker sync
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((registration) => {
      return (registration as any).sync.register('sync-offline-queue');
    }).catch(console.error);
  }
  
  // Listen for sync completion from service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'SYNC_COMPLETE') {
        handleSyncComplete(event.data.success);
      }
    });
  }
  
  // Setup realtime subscription for conflict detection
  setupRealtimeSync();
  
  // Initial sync if online
  if (navigator.onLine) {
    syncNow();
  }
}

/**
 * Add operation to sync queue
 */
export function queueOperation(
  entityType: SyncQueueItem['entityType'],
  entityId: string,
  operation: SyncQueueItem['operation'],
  payload: any
): void {
  const item: SyncQueueItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    entityType,
    entityId,
    operation,
    payload,
    timestamp: new Date().toISOString(),
    retryCount: 0
  };
  
  syncQueue.update(queue => {
    const updated = [...queue, item];
    saveQueue(updated);
    return updated;
  });
  
  syncStatus.update(s => ({ ...s, queueLength: get(syncQueue).length }));
  
  // Try to sync immediately if online
  if (navigator.onLine) {
    syncNow();
  }
}

/**
 * Sync queue with server
 */
export async function syncNow(): Promise<void> {
  if (get(syncStatus).syncing) {
    console.log('[Sync] Already syncing...');
    return;
  }
  
  const queue = get(syncQueue);
  if (queue.length === 0) {
    return;
  }
  
  syncStatus.update(s => ({ ...s, syncing: true }));
  
  try {
    const deviceId = getDeviceId();
    
    // Send queue to server
    const { data, error } = await supabase.rpc('process_sync_queue_batch', {
      p_device_id: deviceId,
      p_queue_items: queue.map(item => ({
        entity_type: item.entityType,
        entity_id: item.entityId,
        operation: item.operation,
        payload: item.payload,
        client_timestamp: item.timestamp
      }))
    });
    
    if (error) throw error;
    
    // Process results
    const results = data as Array<{ id: string; success: boolean; conflict: boolean; error?: string }>;
    const conflicts: string[] = [];
    const successful: string[] = [];
    const failed: SyncQueueItem[] = [];
    
    results.forEach((result, index) => {
      if (result.success) {
        successful.push(queue[index].id);
      } else if (result.conflict) {
        conflicts.push(queue[index].id);
      } else {
        failed.push({ ...queue[index], error: result.error, retryCount: queue[index].retryCount + 1 });
      }
    });
    
    // Update queue - remove successful, keep failed and conflicts
    syncQueue.update(q => {
      const updated = q.filter(item => !successful.includes(item.id));
      saveQueue(updated);
      return updated;
    });
    
    syncStatus.update(s => ({
      ...s,
      syncing: false,
      queueLength: get(syncQueue).length,
      lastSync: new Date().toISOString(),
      conflicts: conflicts.length
    }));
    
    // Notify user of conflicts
    if (conflicts.length > 0) {
      notifyConflicts(conflicts.length);
    }
    
  } catch (error) {
    console.error('[Sync] Sync failed:', error);
    syncStatus.update(s => ({ ...s, syncing: false }));
  }
}

/**
 * Clear sync queue
 */
export function clearQueue(): void {
  syncQueue.set([]);
  saveQueue([]);
  syncStatus.update(s => ({ ...s, queueLength: 0 }));
}

/**
 * Get or create device ID
 */
function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Load queue from localStorage
 */
function loadQueue(): void {
  try {
    const stored = localStorage.getItem(SYNC_QUEUE_KEY);
    if (stored) {
      const queue = JSON.parse(stored) as SyncQueueItem[];
      syncQueue.set(queue);
      syncStatus.update(s => ({ ...s, queueLength: queue.length }));
    }
  } catch (error) {
    console.error('[Sync] Failed to load queue:', error);
  }
}

/**
 * Save queue to localStorage
 */
function saveQueue(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('[Sync] Failed to save queue:', error);
  }
}

/**
 * Handle online event
 */
function handleOnline(): void {
  console.log('[Sync] Device is online');
  syncStatus.update(s => ({ ...s, online: true }));
  syncNow();
}

/**
 * Handle offline event
 */
function handleOffline(): void {
  console.log('[Sync] Device is offline');
  syncStatus.update(s => ({ ...s, online: false }));
}

/**
 * Handle sync completion from service worker
 */
function handleSyncComplete(success: boolean): void {
  if (success) {
    console.log('[Sync] Background sync completed');
    syncNow(); // Re-sync to get latest status
  }
}

/**
 * Setup realtime sync subscription
 */
function setupRealtimeSync(): void {
  syncChannel = supabase.channel('sync_updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_conflicts'
      },
      (payload) => {
        console.log('[Sync] Conflict detected:', payload);
        syncStatus.update(s => ({ ...s, conflicts: s.conflicts + 1 }));
      }
    )
    .subscribe();
}

/**
 * Notify user of sync conflicts
 */
function notifyConflicts(count: number): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Sync Conflicts Detected', {
      body: `${count} operation(s) have conflicts that need resolution.`,
      icon: '/icon-192.png',
      tag: 'sync-conflicts'
    });
  }
}

/**
 * Cleanup on unmount
 */
export function cleanupSyncManager(): void {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  
  if (syncChannel) {
    supabase.removeChannel(syncChannel);
    syncChannel = null;
  }
}
