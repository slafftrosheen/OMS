import { writable } from 'svelte/store';
import { base } from '$app/paths';

export interface CapacityConfig {
  defaultCapacity: number;
  customCapacities: Record<string, number>; // ISO date -> capacity
}

const DEFAULT_CONFIG: CapacityConfig = {
  defaultCapacity: 10,
  customCapacities: {}
};

const isBrowser = typeof window !== 'undefined';

function createCapacityStore() {
  const { subscribe, set, update } = writable<CapacityConfig>(DEFAULT_CONFIG);

  // Load from database on init
  if (isBrowser) {
    fetch(`${base}/api/calendar/capacity`)
      .then(res => res.ok ? res.json() : DEFAULT_CONFIG)
      .then(data => set(data))
      .catch(() => set(DEFAULT_CONFIG));
  }

  return {
    subscribe,
    setDefaultCapacity: async (capacity: number) => {
      update(config => ({ ...config, defaultCapacity: capacity }));
      
      if (isBrowser) {
        try {
          await fetch(`${base}/api/calendar/capacity`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ defaultCapacity: capacity })
          });
        } catch (err) {
          console.error('Failed to save capacity config:', err);
        }
      }
    },
    setDayCapacity: async (iso: string, capacity: number) => {
      update(config => ({
        ...config,
        customCapacities: { ...config.customCapacities, [iso]: capacity }
      }));
      
      if (isBrowser) {
        try {
          await fetch(`${base}/api/calendar/capacity`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ date: iso, capacity })
          });
        } catch (err) {
          console.error('Failed to save day capacity:', err);
        }
      }
    },
    getDayCapacity: (iso: string): number => {
      let capacity = DEFAULT_CONFIG.defaultCapacity;
      const unsub = subscribe(config => {
        capacity = config.customCapacities[iso] ?? config.defaultCapacity;
      });
      unsub();
      return capacity;
    },
    reset: async () => {
      set(DEFAULT_CONFIG);
      
      if (isBrowser) {
        try {
          await fetch(`${base}/api/calendar/capacity`, {
            method: 'DELETE'
          });
        } catch (err) {
          console.error('Failed to reset capacity config:', err);
        }
      }
    }
  };
}

export const capacityConfig = createCapacityStore();
