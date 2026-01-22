// src/lib/pwa/pwa-service.ts
import { browser } from '$app/environment';
import { writable } from 'svelte/store';

interface PWAInstallPrompt {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installPrompt = writable<PWAInstallPrompt | null>(null);
export const isInstalled = writable(false);
export const isOnline = writable(true);
export const updateAvailable = writable(false);

class PWAService {
	private registration: ServiceWorkerRegistration | null = null;

	async init() {
		if (!browser) return;

		// Register service worker
		if ('serviceWorker' in navigator) {
			try {
				this.registration = await navigator.serviceWorker.register(
					'/service-worker.js',
					{ scope: '/' }
				);

				console.log('[PWA] Service worker registered');

				// Check for updates
				this.registration.addEventListener('updatefound', () => {
					const newWorker = this.registration!.installing;
					if (newWorker) {
						newWorker.addEventListener('statechange', () => {
							if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
								updateAvailable.set(true);
							}
						});
					}
				});
			} catch (error) {
				console.error('[PWA] Service worker registration failed:', error);
			}
		}

		// Listen for install prompt
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			installPrompt.set(e as any);
		});

		// Check if already installed
		if (window.matchMedia('(display-mode: standalone)').matches) {
			isInstalled.set(true);
		}

		// Monitor online/offline status
		window.addEventListener('online', () => isOnline.set(true));
		window.addEventListener('offline', () => isOnline.set(false));
		isOnline.set(navigator.onLine);

		// Request notification permission
		this.requestNotificationPermission();
	}

	async install() {
		const prompt = await new Promise<PWAInstallPrompt | null>((resolve) => {
			const unsubscribe = installPrompt.subscribe((value) => {
				resolve(value);
				unsubscribe();
			});
		});

		if (!prompt) {
			console.log('[PWA] Install prompt not available');
			return false;
		}

		try {
			await prompt.prompt();
			const result = await prompt.userChoice;
			
			if (result.outcome === 'accepted') {
				isInstalled.set(true);
				installPrompt.set(null);
				return true;
			}
			return false;
		} catch (error) {
			console.error('[PWA] Install failed:', error);
			return false;
		}
	}

	async requestNotificationPermission() {
		if (!('Notification' in window)) {
			console.log('[PWA] Notifications not supported');
			return false;
		}

		if (Notification.permission === 'granted') {
			return true;
		}

		if (Notification.permission !== 'denied') {
			const permission = await Notification.requestPermission();
			return permission === 'granted';
		}

		return false;
	}

	async subscribeToPush() {
		if (!this.registration) {
			console.error('[PWA] Service worker not registered');
			return null;
		}

		try {
			const subscription = await this.registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: this.urlBase64ToUint8Array(
					import.meta.env.VITE_VAPID_PUBLIC_KEY
				)
			});

			// Send subscription to server
			await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(subscription)
			});

			return subscription;
		} catch (error) {
			console.error('[PWA] Push subscription failed:', error);
			return null;
		}
	}

	async updateServiceWorker() {
		if (!this.registration) return;

		const newWorker = this.registration.waiting;
		if (newWorker) {
			newWorker.postMessage({ type: 'SKIP_WAITING' });
			
			// Reload page when new worker takes control
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				window.location.reload();
			});
		}
	}

	private urlBase64ToUint8Array(base64String: string): Uint8Array {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);
		
		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		
		return outputArray;
	}
}

export const pwaService = new PWAService();
