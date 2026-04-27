/**
 * Type-safe localStorage wrapper with JSON serialization
 */

export class Storage<T extends Record<string, any>> {
  private prefix: string;
  
  constructor(prefix = 'oms') {
    this.prefix = prefix;
  }
  
  /**
   * Get item from storage
   */
  get<K extends keyof T>(key: K): T[K] | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const item = localStorage.getItem(this.getKey(key));
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Failed to get ${String(key)} from storage:`, error);
      return null;
    }
  }
  
  /**
   * Set item in storage
   */
  set<K extends keyof T>(key: K, value: T[K]): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      localStorage.setItem(this.getKey(key), JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Failed to set ${String(key)} in storage:`, error);
      return false;
    }
  }
  
  /**
   * Remove item from storage
   */
  remove<K extends keyof T>(key: K): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      localStorage.removeItem(this.getKey(key));
      return true;
    } catch (error) {
      console.error(`Failed to remove ${String(key)} from storage:`, error);
      return false;
    }
  }
  
  /**
   * Clear all items with this prefix
   */
  clear(): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      const keys = Object.keys(localStorage);
      const prefixedKeys = keys.filter(k => k.startsWith(`${this.prefix}:`));
      prefixedKeys.forEach(k => localStorage.removeItem(k));
      return true;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      return false;
    }
  }
  
  /**
   * Check if key exists
   */
  has<K extends keyof T>(key: K): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(this.getKey(key)) !== null;
  }
  
  /**
   * Get all keys
   */
  keys(): string[] {
    if (typeof window === 'undefined') return [];
    
    const allKeys = Object.keys(localStorage);
    return allKeys
      .filter(k => k.startsWith(`${this.prefix}:`))
      .map(k => k.substring(`${this.prefix}:`.length));
  }
  
  private getKey<K extends keyof T>(key: K): string {
    return `${this.prefix}:${String(key)}`;
  }
}

/**
 * Default storage instance
 */
export const storage = new Storage();

/**
 * Session storage wrapper (same API as localStorage but session-based)
 */
export class SessionStorage<T extends Record<string, any>> {
  private prefix: string;
  
  constructor(prefix = 'oms') {
    this.prefix = prefix;
  }
  
  get<K extends keyof T>(key: K): T[K] | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const item = window.sessionStorage.getItem(this.getKey(key));
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Failed to get ${String(key)} from session storage:`, error);
      return null;
    }
  }
  
  set<K extends keyof T>(key: K, value: T[K]): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      window.sessionStorage.setItem(this.getKey(key), JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Failed to set ${String(key)} in session storage:`, error);
      return false;
    }
  }
  
  remove<K extends keyof T>(key: K): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      window.sessionStorage.removeItem(this.getKey(key));
      return true;
    } catch (error) {
      console.error(`Failed to remove ${String(key)} from session storage:`, error);
      return false;
    }
  }
  
  clear(): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      const keys = Object.keys(window.sessionStorage);
      const prefixedKeys = keys.filter(k => k.startsWith(`${this.prefix}:`));
      prefixedKeys.forEach(k => window.sessionStorage.removeItem(k));
      return true;
    } catch (error) {
      console.error('Failed to clear session storage:', error);
      return false;
    }
  }
  
  private getKey<K extends keyof T>(key: K): string {
    return `${this.prefix}:${String(key)}`;
  }
}

export const sessionStorage = new SessionStorage();
