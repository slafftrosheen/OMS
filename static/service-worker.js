// static/service-worker.js
const CACHE_NAME = 'oms-v1.1.0';
const OFFLINE_URL = '/offline';

// Assets to cache immediately
const PRECACHE_URLS = [
	'/',
	'/offline',
	'/manifest.json',
	'/icons/icon-192x192.png',
	'/icons/icon-512x512.png'
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
	'/api/draft-orders',
	'/api/inventory/items',
	'/api/profiles/templates'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
	console.log('[SW] Installing service worker');
	
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('[SW] Precaching assets');
			return cache.addAll(PRECACHE_URLS);
		})
	);
	
	// Activate immediately
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('[SW] Activating service worker');
	
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((cacheName) => {
					if (cacheName !== CACHE_NAME) {
						console.log('[SW] Deleting old cache:', cacheName);
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
	
	// Take control immediately
	self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Skip non-GET requests
	if (request.method !== 'GET') {
		return;
	}

	// Skip chrome extensions
	if (url.protocol === 'chrome-extension:') {
		return;
	}

	// API requests: Network first, cache fallback
	if (url.pathname.startsWith('/api/')) {
		event.respondWith(networkFirstStrategy(request));
		return;
	}

	// Static assets: Cache first, network fallback
	if (
		url.pathname.startsWith('/icons/') ||
		url.pathname.startsWith('/screenshots/') ||
		url.pathname.endsWith('.css') ||
		url.pathname.endsWith('.js') ||
		url.pathname.endsWith('.png') ||
		url.pathname.endsWith('.jpg') ||
		url.pathname.endsWith('.svg')
	) {
		event.respondWith(cacheFirstStrategy(request));
		return;
	}

	// HTML pages: Network first, offline fallback
	if (request.headers.get('accept').includes('text/html')) {
		event.respondWith(htmlNetworkFirstStrategy(request));
		return;
	}

	// Default: network only
	event.respondWith(fetch(request));
});

// Network first strategy (for API calls)
async function networkFirstStrategy(request) {
	try {
		const response = await fetch(request);
		
		// Cache successful responses
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		
		return response;
	} catch (error) {
		// Network failed, try cache
		const cached = await caches.match(request);
		if (cached) {
			console.log('[SW] Serving from cache (offline):', request.url);
			return cached;
		}
		
		// Return offline response for API calls
		return new Response(
			JSON.stringify({ error: 'Offline', cached: false }),
			{
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
}

// Cache first strategy (for static assets)
async function cacheFirstStrategy(request) {
	const cached = await caches.match(request);
	if (cached) {
		return cached;
	}

	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch (error) {
		console.error('[SW] Failed to fetch:', request.url);
		return new Response('Offline', { status: 503 });
	}
}

// HTML network first strategy
async function htmlNetworkFirstStrategy(request) {
	try {
		const response = await fetch(request);
		return response;
	} catch (error) {
		// Return offline page
		const cached = await caches.match(OFFLINE_URL);
		if (cached) {
			return cached;
		}
		
		return new Response('Offline', { status: 503 });
	}
}

// Background sync for failed requests
self.addEventListener('sync', (event) => {
	if (event.tag === 'sync-orders') {
		event.waitUntil(syncOrders());
	}
});

async function syncOrders() {
	// Get pending orders from IndexedDB and sync
	console.log('[SW] Syncing pending orders');
	// Implementation depends on your offline storage strategy
}

// Push notifications
self.addEventListener('push', (event) => {
	const data = event.data.json();
	
	const options = {
		body: data.body,
		icon: '/icons/icon-192x192.png',
		badge: '/icons/badge-72x72.png',
		tag: data.tag || 'default',
		requireInteraction: data.requireInteraction || false,
		data: data.data || {}
	};

	event.waitUntil(
		self.registration.showNotification(data.title, options)
	);
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const urlToOpen = event.notification.data.url || '/';

	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true })
			.then((windowClients) => {
				// Check if there's already a window open
				for (const client of windowClients) {
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
});
