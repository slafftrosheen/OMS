/**
 * Offline Store
 * Manages offline data and sync queue
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface PendingAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  data: any;
  timestamp: number;
}

interface OfflineState {
  isOnline: boolean;
  pendingActions: PendingAction[];
  syncInProgress: boolean;
  lastSyncAt: number | null;
}

const initialState: OfflineState = {
  isOnline: browser ? navigator.onLine : true,
  pendingActions: [],
  syncInProgress: false,
  lastSyncAt: null
};

function createOfflineStore() {
  const { subscribe, set, update } = writable<OfflineState>(initialState);

  return {
    subscribe,
    
    setOnline: (isOnline: boolean) => {
      update(state => ({ ...state, isOnline }));
      
      if (isOnline) {
        offlineStore.sync();
      }
    },

    addPendingAction: (action: Omit<PendingAction, 'id' | 'timestamp'>) => {
      const pendingAction: PendingAction = {
        ...action,
        id: crypto.randomUUID(),
        timestamp: Date.now()
      };

      update(state => ({
        ...state,
        pendingActions: [...state.pendingActions, pendingAction]
      }));

      // Save to IndexedDB
      if (browser) {
        savePendingActionToDB(pendingAction);
      }
    },

    removePendingAction: (id: string) => {
      update(state => ({
        ...state,
        pendingActions: state.pendingActions.filter(a => a.id !== id)
      }));

      // Remove from IndexedDB
      if (browser) {
        removePendingActionFromDB(id);
      }
    },

    sync: async () => {
      update(state => ({ ...state, syncInProgress: true }));

      try {
        // Get pending actions
        const state = await new Promise<OfflineState>(resolve => {
          const unsubscribe = subscribe(s => {
            resolve(s);
            unsubscribe();
          });
        });

        for (const action of state.pendingActions) {
          try {
            await executePendingAction(action);
            offlineStore.removePendingAction(action.id);
          } catch (error) {
            console.error('Failed to sync action:', action.id, error);
          }
        }

        update(state => ({
          ...state,
          syncInProgress: false,
          lastSyncAt: Date.now()
        }));

      } catch (error) {
        console.error('Sync failed:', error);
        update(state => ({ ...state, syncInProgress: false }));
      }
    },

    clearPendingActions: () => {
      update(state => ({ ...state, pendingActions: [] }));
      if (browser) {
        clearPendingActionsFromDB();
      }
    }
  };
}

export const offlineStore = createOfflineStore();

// IndexedDB helpers
async function savePendingActionToDB(action: PendingAction) {
  const db = await openDB();
  const tx = db.transaction('pendingActions', 'readwrite');
  await tx.objectStore('pendingActions').add(action);
}

async function removePendingActionFromDB(id: string) {
  const db = await openDB();
  const tx = db.transaction('pendingActions', 'readwrite');
  await tx.objectStore('pendingActions').delete(id);
}

async function clearPendingActionsFromDB() {
  const db = await openDB();
  const tx = db.transaction('pendingActions', 'readwrite');
  await tx.objectStore('pendingActions').clear();
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('oms-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pendingActions')) {
        db.createObjectStore('pendingActions', { keyPath: 'id' });
      }
    };
  });
}

async function executePendingAction(action: PendingAction) {
  const endpoint = getEndpointForEntity(action.entity);
  
  let method = 'POST';
  let url = endpoint;
  
  if (action.type === 'update') {
    method = 'PATCH';
    url = `${endpoint}/${action.data.id}`;
  } else if (action.type === 'delete') {
    method = 'DELETE';
    url = `${endpoint}/${action.data.id}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: action.type !== 'delete' ? JSON.stringify(action.data) : undefined
  });

  if (!response.ok) {
    throw new Error(`Failed to sync ${action.type} ${action.entity}`);
  }

  return response.json();
}

function getEndpointForEntity(entity: string): string {
  const endpoints: Record<string, string> = {
    order: '/api/orders',
    station_log: '/api/station-logs',
    photo: '/api/photos',
    comment: '/api/comments'
  };

  return endpoints[entity] || `/api/${entity}`;
}

// Initialize online/offline listeners
if (browser) {
  window.addEventListener('online', () => offlineStore.setOnline(true));
  window.addEventListener('offline', () => offlineStore.setOnline(false));
}