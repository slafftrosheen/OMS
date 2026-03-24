import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Mock environment
vi.mock('$app/environment', () => ({
  browser: true,
  dev: false
}));

describe('websocket-store', () => {
  let websocket: any;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let intervalIds: number[] = [];
  let intervalCallbacks: Map<number, () => void | Promise<void>> = new Map();
  let nextIntervalId = 1;
  let mockWebSocket: any;

  beforeEach(async () => {
    // Reset modules
    vi.resetModules();
    
    // Track setInterval calls
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    intervalIds = [];
    intervalCallbacks = new Map();
    nextIntervalId = 1;

    global.setInterval = vi.fn((callback: () => void | Promise<void>, _delay: number) => {
      const id = nextIntervalId++;
      intervalIds.push(id);
      intervalCallbacks.set(id, callback);
      return id as any;
    }) as any;

    global.clearInterval = vi.fn((id: number) => {
      const index = intervalIds.indexOf(id);
      if (index > -1) {
        intervalIds.splice(index, 1);
        intervalCallbacks.delete(id);
      }
    }) as any;

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    // Mock window for local K3s cluster environment
    global.window = {
      location: {
        hostname: 'reclame-orch.local',
        host: 'reclame-orch.local',
        protocol: 'http:'
      },
      dispatchEvent: vi.fn(),
      localStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn()
      }
    } as any;

    // Mock WebSocket
    mockWebSocket = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1 // OPEN
    };
    global.WebSocket = vi.fn(() => mockWebSocket) as any;
    (global.WebSocket as any).OPEN = 1;

    // Import websocket store after mocking
    const module = await import('$lib/stores/websocket');
    websocket = module.websocket;
  });

  afterEach(() => {
    // Clean up intervals
    intervalIds.forEach(id => originalClearInterval(id));
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should prevent multiple initializations', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      // First connect
      websocket.connect();
      
      // Second connect should be ignored
      websocket.connect();
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket store already initialized');
      
      consoleSpy.mockRestore();
    });

    it('should allow reconnection after disconnect', () => {
      // First connect
      websocket.connect();
      
      // Disconnect
      websocket.disconnect();
      
      // Should allow new connection
      websocket.connect();
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
    });
  });

  describe('WebSocket connection on local cluster', () => {
    it('should attempt WebSocket connection on local network', () => {
      websocket.connect();
      
      expect(global.WebSocket).toHaveBeenCalledWith('ws://reclame-orch.local/ws');
    });

    it('should set supportsWebSocket to true on connect', () => {
      websocket.connect();
      
      // Simulate successful connection
      mockWebSocket.onopen();
      
      const state = get(websocket);
      expect(state.supportsWebSocket).toBe(true);
      expect(state.connected).toBe(true);
    });

    it('should handle connection close and attempt reconnect', () => {
      websocket.connect();
      
      // Simulate connection close
      mockWebSocket.onclose();
      
      const state = get(websocket);
      expect(state.connected).toBe(false);
    });
  });

  describe('message handling', () => {
    it('should dispatch order_update events', () => {
      websocket.connect();
      
      // Simulate a message
      const testMessage = { type: 'order_update', data: { id: '123' } };
      mockWebSocket.onmessage({ data: JSON.stringify(testMessage) });
      
      expect(global.window.dispatchEvent).toHaveBeenCalled();
    });

    it('should handle malformed messages gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      websocket.connect();
      mockWebSocket.onmessage({ data: 'not valid json' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse WebSocket message:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('send', () => {
    it('should send messages when connected', () => {
      websocket.connect();
      mockWebSocket.onopen();
      
      websocket.send({ type: 'test', data: 'hello' });
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'test', data: 'hello' })
      );
    });

    it('should warn when sending while disconnected', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Don't connect, just try to send
      websocket.send({ type: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket not connected, message not sent');
      
      consoleSpy.mockRestore();
    });
  });
});
