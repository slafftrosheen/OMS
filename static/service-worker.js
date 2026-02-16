/**
 * Service Worker for OMS PWA
 * Handles offline caching, background sync, and push notifications
 */

const CACHE_VERSION = 'oms-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Add your main CSS and JS bundles here
];

// Maximum cache sizes
const MAX_DYNAMIC_CACHE_SIZE = 50;
const MAX_IMAGE_CACHE_SIZE = 100;

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith('oms-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMAGE_CACHE)
            .map((key) => {
              console.log('[Service Worker] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions and other protocols
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Images - cache first, network fallback
  if (request.destination === 'image') {
    event.respondWith(cacheFirstStrategy(request, IMAGE_CACHE));
    return;
  }

  // Static assets - cache first
  if (STATIC_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }
  
  // Handle static assets with _app path
  if (url.pathname.includes('_app/immutable')) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // Everything else - network first
  event.respondWith(networkFirstStrategy(request));
});

// Network first strategy with cache fallback
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/offline');
    }
    
    // Return a generic offline response
    return new Response('Offline - content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Cache first strategy with network fallback
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    fetch(request).then((networkResponse) => {
      if (networkResponse.ok) {
        caches.open(cacheName).then((cache) => {
          cache.put(request, networkResponse);
        });
      }
    });
    
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
      limitCacheSize(cacheName, cacheName === IMAGE_CACHE ? MAX_IMAGE_CACHE_SIZE : MAX_DYNAMIC_CACHE_SIZE);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Cache and network failed:', request.url);
    throw error;
  }
}

// Limit cache size
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    limitCacheSize(cacheName, maxItems);
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  } else if (event.tag === 'sync-photos') {
    event.waitUntil(syncPhotos());
  }
});

async function syncOrders() {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['pendingOrders'], 'readwrite');
    const store = transaction.objectStore('pendingOrders');
    
    // Get all pending orders
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = async () => {
      const pendingOrders = getAllRequest.result ?? [];
      
      if (pendingOrders.length === 0) {
        console.log('[Service Worker] No pending orders to sync');
        return;
      }
      
      const syncedOrderIds = [];
      
      // Sync all orders first
      for (const order of pendingOrders) {
        try {
          const response = await fetch('/api/orders', {
            method: order.method || 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(order.data)
          });
          
          if (response.ok) {
            syncedOrderIds.push(order.id);
            console.log('[Service Worker] Synced order:', order.id);
          }
        } catch (error) {
          console.error('[Service Worker] Failed to sync order:', order.id, error);
        }
      }
      
      // Delete synced orders after all fetches complete
      if (syncedOrderIds.length > 0) {
        const deleteTransaction = db.transaction(['pendingOrders'], 'readwrite');
        const deleteStore = deleteTransaction.objectStore('pendingOrders');
        syncedOrderIds.forEach(id => deleteStore.delete(id));
      }
    };
    
    getAllRequest.onerror = () => {
      console.error('[Service Worker] Failed to get pending orders:', getAllRequest.error);
    };
  } catch (error) {
    console.error('[Service Worker] Sync orders error:', error);
  }
}

async function syncPhotos() {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['pendingPhotos'], 'readwrite');
    const store = transaction.objectStore('pendingPhotos');
    
    // Get all pending photos
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = async () => {
      const pendingPhotos = getAllRequest.result ?? [];
      
      if (pendingPhotos.length === 0) {
        console.log('[Service Worker] No pending photos to sync');
        return;
      }
      
      const syncedPhotoIds = [];
      
      // Sync all photos first
      for (const photo of pendingPhotos) {
        try {
          const formData = new FormData();
          formData.append('file', photo.file);
          formData.append('orderId', photo.orderId);
          formData.append('station', photo.station);
          
          const response = await fetch('/api/photos', {
            method: 'POST',
            body: formData
          });
          
          if (response.ok) {
            syncedPhotoIds.push(photo.id);
            console.log('[Service Worker] Synced photo:', photo.id);
          }
        } catch (error) {
          console.error('[Service Worker] Failed to sync photo:', photo.id, error);
        }
      }
      
      // Delete synced photos after all fetches complete
      if (syncedPhotoIds.length > 0) {
        const deleteTransaction = db.transaction(['pendingPhotos'], 'readwrite');
        const deleteStore = deleteTransaction.objectStore('pendingPhotos');
        syncedPhotoIds.forEach(id => deleteStore.delete(id));
      }
    };
    
    getAllRequest.onerror = () => {
      console.error('[Service Worker] Failed to get pending photos:', getAllRequest.error);
    };
  } catch (error) {
    console.error('[Service Worker] Sync photos error:', error);
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'OMS Notification';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || 'default',
    data: data.data || {},
    actions: data.actions || [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    const urlToOpen = event.notification.data.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Check if there's already a window open
          for (const client of clientList) {
            if (client.url === urlToOpen && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Open new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// Helper function to open IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('oms-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pendingOrders')) {
        db.createObjectStore('pendingOrders', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('pendingPhotos')) {
        db.createObjectStore('pendingPhotos', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('cachedOrders')) {
        db.createObjectStore('cachedOrders', { keyPath: 'id' });
      }
    };
  });
}

// Message handler for communication with app
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => caches.delete(key))
        );
      })
    );
  } else if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});