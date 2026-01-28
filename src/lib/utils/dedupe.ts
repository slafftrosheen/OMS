// src/lib/utils/dedupe.ts
/**
 * Request deduplication utility to prevent duplicate API calls
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

class RequestDeduplicator {
  private pending: Map<string, PendingRequest<any>> = new Map();
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout = 5000; // 5 seconds default cache

  /**
   * Deduplicate a request by key
   */
  async dedupe<T>(key: string, fn: () => Promise<T>, options?: { 
    cacheTime?: number;
    forceRefresh?: boolean;
  }): Promise<T> {
    const cacheTime = options?.cacheTime ?? this.cacheTimeout;
    const forceRefresh = options?.forceRefresh ?? false;

    // Check cache first (if not forcing refresh)
    if (!forceRefresh) {
      const cached = this.cache.get(key);
      if (cached && (Date.now() - cached.timestamp) < cacheTime) {
        return cached.data;
      }
    }

    // Check if request is already pending
    const pending = this.pending.get(key);
    if (pending && (Date.now() - pending.timestamp) < 30000) { // 30 second timeout
      return pending.promise;
    }

    // Create new request
    const promise = fn()
      .then(data => {
        // Cache the result
        this.cache.set(key, { data, timestamp: Date.now() });
        // Remove from pending
        this.pending.delete(key);
        return data;
      })
      .catch(error => {
        // Remove from pending on error
        this.pending.delete(key);
        throw error;
      });

    // Store as pending
    this.pending.set(key, { promise, timestamp: Date.now() });

    return promise;
  }

  /**
   * Clear cache for specific key or all keys
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Clear pending requests
   */
  clearPending(key?: string): void {
    if (key) {
      this.pending.delete(key);
    } else {
      this.pending.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingSize: this.pending.size,
      cacheKeys: Array.from(this.cache.keys()),
      pendingKeys: Array.from(this.pending.keys())
    };
  }
}

// Singleton instance
export const requestDeduplicator = new RequestDeduplicator();

// Helper function
export async function dedupeRequest<T>(
  key: string, 
  fn: () => Promise<T>, 
  options?: { cacheTime?: number; forceRefresh?: boolean }
): Promise<T> {
  return requestDeduplicator.dedupe(key, fn, options);
}