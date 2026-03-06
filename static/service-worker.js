/**
 * Service Worker for OMS PWA
 * Simplified version - no aggressive caching
 */

const CACHE_VERSION = 'oms-v2.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Install event
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version:', CACHE_VERSION);
  self.skipWaiting();
});

// Activate event - clear ALL old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        console.log('[Service Worker] Found caches:', keys);
        return Promise.all(
          keys.map((key) => {
            console.log('[Service Worker] Deleting cache:', key);
            return caches.delete(key);
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - network only, no caching for JS/CSS
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip non-HTTP requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Always fetch from network for JS, CSS, HTML
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'document' ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.html')) {
    
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Return network response
          return response;
        })
        .catch((error) => {
          // Network failed - return offline response for HTML
          if (request.destination === 'document') {
            return new Response('Offline - please refresh the page', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          }
          // For JS/CSS, rethrow to show error in console
          throw error;
        })
    );
    return;
  }

  // Images - cache first
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            return cached;
          }
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(STATIC_CACHE).then((cache) => {
                  cache.put(request, clone);
                });
              }
              return response;
            });
        })
        .catch(() => {
          // Return placeholder or nothing
          return new Response('', { status: 404 });
        })
    );
    return;
  }

  // API requests - network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Everything else - network only
  event.respondWith(
    fetch(request)
      .catch(() => {
        return new Response('Offline', { status: 503 });
      })
  );
});

// Message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
