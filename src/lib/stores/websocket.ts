// src/lib/stores/websocket.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { dev } from '$app/environment';
import { PUBLIC_WS_URL } from '$env/static/public';

interface WebSocketMessage {
    type: string;
    data: any;
}

interface WebSocketStore {
    connected: boolean;
    messages: WebSocketMessage[];
    supportsWebSocket: boolean;
}

function createWebSocketStore() {
    const { subscribe, update } = writable<WebSocketStore>({
        connected: false,
        messages: [],
        supportsWebSocket: false
    });

    let ws: WebSocket | null = null;
    let reconnectTimeout: number;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3; // Reduced from 5
    const RECONNECT_DELAY = 5000; // Increased delay
    let connectionDisabled = false;

    // WebSocket is always supported on local K3s cluster
    const supportsWS = true;

    function connect() {
        if (!browser) return;
        
        // Don't attempt WebSocket if disabled
        if (!supportsWS) {
            console.log('WebSocket not supported on this platform, using polling fallback');
            update(state => ({ ...state, supportsWebSocket: false, connected: false }));
            return;
        }

        if (connectionDisabled) {
            console.log('WebSocket connection disabled after max retries');
            return;
        }

        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = PUBLIC_WS_URL || `${protocol}//${window.location.host}/ws`;

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WebSocket connected');
                reconnectAttempts = 0;
                update(state => ({ ...state, connected: true, supportsWebSocket: true }));

                // Send authentication
                const token = localStorage.getItem('auth_token');
                if (token) {
                    send({ type: 'authenticate', token });
                }
            };

            ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    update(state => ({
                        ...state,
                        messages: [...state.messages, message]
                    }));

                    // Handle specific message types
                    handleMessage(message);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                // Don't spam console with errors
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                update(state => ({ ...state, connected: false }));

                // Attempt reconnection with exponential backoff
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
                    console.log(`Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    reconnectTimeout = setTimeout(() => {
                        connect();
                    }, delay) as unknown as number;
                } else {
                    console.log('Max reconnection attempts reached. WebSocket disabled.');
                    connectionDisabled = true;
                    update(state => ({ ...state, supportsWebSocket: false }));
                }
            };
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            update(state => ({ ...state, connected: false, supportsWebSocket: false }));
        }
    }

    function disconnect() {
        if (ws) {
            ws.close();
            ws = null;
        }
        clearTimeout(reconnectTimeout);
        update(state => ({ ...state, connected: false }));
    }

    function send(message: any) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, message not sent');
        }
    }

    function handleMessage(message: WebSocketMessage) {
        switch (message.type) {
            case 'order_update':
                // Trigger order store update
                console.log('Order updated:', message.data);
                // Could dispatch custom event here for components to listen to
                if (browser) {
                    window.dispatchEvent(new CustomEvent('order-update', { detail: message.data }));
                }
                break;

            case 'stage_update':
                // Trigger production board update
                console.log('Stage updated:', message.data);
                if (browser) {
                    window.dispatchEvent(new CustomEvent('stage-update', { detail: message.data }));
                }
                break;

            case 'new_message':
                // Trigger chat update
                console.log('New chat message:', message.data);
                if (browser) {
                    window.dispatchEvent(new CustomEvent('new-chat-message', { detail: message.data }));
                }
                break;

            case 'notification':
                // Add to notifications
                console.log('New notification:', message.data);
                if (browser) {
                    window.dispatchEvent(new CustomEvent('notification', { detail: message.data }));
                }
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    // Polling fallback for platforms without WebSocket support
    let pollingInterval: number | null = null;
    let isPolling = false; // Flag to prevent duplicate intervals
    let pollingErrorCount = 0;
    const MAX_POLLING_ERRORS = 5;
    
    function startPolling() {
        if (!browser || ws || isPolling) return; // Check flag
        
        console.log('Starting polling fallback (WebSocket not available)');
        isPolling = true; // Set flag
        pollingErrorCount = 0; // Reset error count
        
        // Poll for updates every 2 minutes
        pollingInterval = setInterval(async () => {
            try {
                // Fetch updates from REST API instead
                // This is a lightweight alternative to WebSocket
                console.log('Polling for updates...');
                
                // Actually fetch data here instead of just logging
                const response = await fetch('/api/updates', {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (response.ok) {
                    const updates = await response.json();
                    pollingErrorCount = 0; // Reset on success
                    // Process updates...
                } else {
                    pollingErrorCount++;
                    console.error('Polling failed with status:', response.status);
                }
            } catch (error) {
                pollingErrorCount++;
                console.error('Polling error:', error);
                
                // Stop polling after repeated failures to prevent resource waste
                if (pollingErrorCount >= MAX_POLLING_ERRORS) {
                    console.error('Max polling errors reached. Stopping polling.');
                    stopPolling();
                }
            }
        }, 120000) as unknown as number; // Changed from 30000 to 120000 (2 minutes)
    }

    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        isPolling = false; // Reset flag
        pollingErrorCount = 0; // Reset error count
        console.log('Polling stopped');
    }

    // Singleton pattern - only allow one connection
    let initialized = false;

    return {
        subscribe,
        connect: () => {
            if (initialized) {
                console.log('WebSocket store already initialized');
                return;
            }
            initialized = true;
            
            if (supportsWS) {
                connect();
            } else {
                update(state => ({ ...state, supportsWebSocket: false }));
                startPolling();
            }
        },
        disconnect: () => {
            disconnect();
            stopPolling();
            initialized = false;
        },
        send
    };
}

export const websocket = createWebSocketStore();