import { vi, describe, it, expect, beforeEach } from 'vitest';
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

    // Mock window
    global.window = {
      location: {
        hostname: 'vercel.app', // Simulate Vercel environment
        host: 'test.vercel.app',
        protocol: 'https:'
      }
    } as any;

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
      expect(intervalIds.length).toBe(1);
      
      // Second connect should be ignored
      websocket.connect();
      expect(intervalIds.length).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket store already initialized');
      
      consoleSpy.mockRestore();
    });

    it('should allow reconnection after disconnect', () => {
      // First connect
      websocket.connect();
      expect(intervalIds.length).toBe(1);
      const firstId = intervalIds[0];
      
      // Disconnect
      websocket.disconnect();
      expect(global.clearInterval).toHaveBeenCalledWith(firstId);
      
      // Should allow new connection
      websocket.connect();
      expect(intervalIds.length).toBe(1);
    });
  });

  describe('polling interval prevention', () => {
    it('should start only one polling interval', () => {
      websocket.connect();
      
      // Verify only one interval is created
      expect(global.setInterval).toHaveBeenCalledTimes(1);
      expect(intervalIds.length).toBe(1);
    });

    it('should use 2-minute polling interval', () => {
      websocket.connect();
      
      // Verify the interval is 2 minutes (120000ms)
      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        120000
      );
    });

    it('should not create duplicate intervals on multiple connect calls', () => {
      websocket.connect();
      websocket.connect();
      websocket.connect();
      
      // Should still have only one interval
      expect(intervalIds.length).toBe(1);
    });
  });

  describe('polling cleanup', () => {
    it('should clear interval on disconnect', () => {
      websocket.connect();
      const intervalId = intervalIds[0];
      
      websocket.disconnect();
      
      expect(global.clearInterval).toHaveBeenCalledWith(intervalId);
      expect(intervalIds.length).toBe(0);
    });

    it('should reset polling state on disconnect', () => {
      websocket.connect();
      websocket.disconnect();
      
      // Should allow polling to start again
      websocket.connect();
      expect(intervalIds.length).toBe(1);
    });
  });

  describe('polling behavior', () => {
    it('should fetch updates when polling', async () => {
      websocket.connect();
      
      // Get the polling callback
      const pollingCallback = intervalCallbacks.get(intervalIds[0]);
      expect(pollingCallback).toBeDefined();
      
      // Execute the callback
      await pollingCallback!();
      
      // Verify fetch was called
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/updates',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        })
      );
    });

    it('should handle polling errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      
      websocket.connect();
      const pollingCallback = intervalCallbacks.get(intervalIds[0]);
      
      // Should not throw
      await expect(pollingCallback!()).resolves.toBeUndefined();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Polling error:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('store state', () => {
    it('should update supportsWebSocket to false on Vercel', () => {
      websocket.connect();
      
      const state = get(websocket);
      expect(state.supportsWebSocket).toBe(false);
    });

    it('should not be connected when using polling fallback', () => {
      websocket.connect();
      
      const state = get(websocket);
      expect(state.connected).toBe(false);
    });
  });
});
