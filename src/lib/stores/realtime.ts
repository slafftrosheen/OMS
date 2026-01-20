// src/lib/stores/realtime.ts
import { writable } from 'svelte/store';
import { getWebSocketService, initializeWebSocketService } from '$lib/services/websocket-service';

interface RealtimeState {
  connected: boolean;
  orders: any[];
  notifications: any[];
}

const initialState: RealtimeState = {
  connected: false,
  orders: [],
  notifications: []
};

const createRealtimeStore = () => {
  const { subscribe, set, update } = writable<RealtimeState>(initialState);

  let wsInitialized = false;

  const initWebSocket = () => {
    if (wsInitialized) return;
    
    const ws = getWebSocketService();
    if (!ws) {
      // Initialize with default URL - in production this should come from env vars
      const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8080';
      initializeWebSocketService(wsUrl);
    }
    
    const webSocket = getWebSocketService();
    if (webSocket) {
      webSocket.subscribe('order:updated', (order) => {
        update(state => ({
          ...state,
          orders: state.orders.map(o => o.id === order.id ? order : o)
        }));
      });

      webSocket.subscribe('notification:new', (notification) => {
        update(state => ({
          ...state,
          notifications: [notification, ...state.notifications]
        }));
      });

      webSocket.subscribe('connection:status', (status) => {
        update(state => ({
          ...state,
          connected: status.connected
        }));
      });

      // Connect to WebSocket
      webSocket.connect().catch(console.error);
      wsInitialized = true;
    }
  };

  return {
    subscribe,
    set,
    update,
    initWebSocket,
    send: (type: string, payload: any) => {
      const webSocket = getWebSocketService();
      if (webSocket) {
        webSocket.send(type, payload);
      }
    },
    disconnect: () => {
      const webSocket = getWebSocketService();
      if (webSocket) {
        webSocket.disconnect();
        wsInitialized = false;
      }
    }
  };
};

export const realtimeStore = createRealtimeStore();