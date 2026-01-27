// src/lib/stores/websocket.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface WebSocketMessage {
    type: string;
    data: any;
}

interface WebSocketStore {
    connected: boolean;
    messages: WebSocketMessage[];
}

function createWebSocketStore() {
    const { subscribe, update } = writable<WebSocketStore>({
        connected: false,
        messages: []
    });

    let ws: WebSocket | null = null;
    let reconnectTimeout: number;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 3000;

    function connect() {
        if (!browser) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
            reconnectAttempts = 0;
            update(state => ({ ...state, connected: true }));

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
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            update(state => ({ ...state, connected: false }));

            // Attempt reconnection
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                reconnectTimeout = setTimeout(() => {
                    console.log(`Reconnecting... (attempt ${reconnectAttempts})`);
                    connect();
                }, RECONNECT_DELAY) as unknown as number;
            }
        };
    }

    function disconnect() {
        if (ws) {
            ws.close();
            ws = null;
        }
        clearTimeout(reconnectTimeout);
    }

    function send(message: any) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected');
        }
    }

    function handleMessage(message: WebSocketMessage) {
        switch (message.type) {
            case 'order_update':
                // Trigger order store update
                console.log('Order updated:', message.data);
                break;

            case 'stage_update':
                // Trigger production board update
                console.log('Stage updated:', message.data);
                break;

            case 'new_message':
                // Trigger chat update
                console.log('New chat message:', message.data);
                break;

            case 'notification':
                // Add to notifications
                console.log('New notification:', message.data);
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    return {
        subscribe,
        connect,
        disconnect,
        send
    };
}

export const websocket = createWebSocketStore();