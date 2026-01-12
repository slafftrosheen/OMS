// Loading days calendar store - PostgreSQL backed via API
import { listOrders } from '$lib/order/signage-store';
import type { Badge, StageMap } from '$lib/order/types';
import { writable, get } from 'svelte/store';

export type LoadingDay = {
  id: string;
  date: string;
  carrier?: string;
  note?: string;
  active: boolean;
};

export type LoadingAssignment = {
  id: string;
  title: string;
  client: string;
  due: string;
  badges: Badge[];
  stages: StageMap;
};

// Svelte store for reactive UI
export const loadingDays = writable<LoadingDay[]>([]);
export const isLoading = writable<boolean>(false);

// Load all loading days from API
export async function loadAll(): Promise<LoadingDay[]> {
  if (typeof window === 'undefined') return [];
  
  isLoading.set(true);
  try {
    const response = await fetch('/api/loading-days');
    if (response.ok) {
      const data = await response.json();
      loadingDays.set(data);
      return data;
    }
  } catch (err) {
    console.error('Failed to load loading days:', err);
  } finally {
    isLoading.set(false);
  }
  return [];
}

// List all (alias for backward compatibility)
export function listAll(): LoadingDay[] {
  return get(loadingDays);
}

// Get single loading day
export function getDay(id: string): LoadingDay | null {
  return get(loadingDays).find(d => d.id === id) ?? null;
}

// Toggle loading day active status
export async function toggleDay(dateISO: string, defaults = { carrier: '', note: '' }): Promise<LoadingDay | null> {
  try {
    const response = await fetch('/api/loading-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: dateISO,
        carrier: defaults.carrier,
        note: defaults.note
      })
    });

    if (response.ok) {
      const day = await response.json();
      loadingDays.update(days => {
        const existing = days.findIndex(d => d.id === day.id);
        if (existing >= 0) {
          days[existing] = day;
          return [...days];
        }
        return [...days, day].sort((a, b) => a.date.localeCompare(b.date));
      });
      return day;
    }
  } catch (err) {
    console.error('Failed to toggle loading day:', err);
  }
  return null;
}

// Update carrier
export async function setCarrier(dateISO: string, carrier: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/loading-days/${dateISO}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrier })
    });

    if (response.ok) {
      const day = await response.json();
      loadingDays.update(days =>
        days.map(d => d.id === dateISO ? day : d)
      );
      return true;
    }
  } catch (err) {
    console.error('Failed to set carrier:', err);
  }
  return false;
}

// Update note
export async function setNote(dateISO: string, note: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/loading-days/${dateISO}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });

    if (response.ok) {
      const day = await response.json();
      loadingDays.update(days =>
        days.map(d => d.id === dateISO ? day : d)
      );
      return true;
    }
  } catch (err) {
    console.error('Failed to set note:', err);
  }
  return false;
}

// Get upcoming loading days
export function upcoming(fromISO = new Date().toISOString().slice(0, 10)): LoadingDay[] {
  return get(loadingDays).filter(d => d.active && d.date >= fromISO);
}

// Get usage info for a loading day (orders assigned to it)
export async function usage(dateISO: string): Promise<{ assigned: number; carrier: string; orders: LoadingAssignment[] }> {
  try {
    const response = await fetch(`/api/loading-days/${dateISO}`);
    if (response.ok) {
      const data = await response.json();
      return {
        assigned: data.assigned || 0,
        carrier: data.carrier || '',
        orders: (data.orders || []).map((o: any) => ({
          id: o.id,
          title: o.title,
          client: o.client,
          due: o.due,
          badges: [],
          stages: {}
        }))
      };
    }
  } catch (err) {
    console.error('Failed to get usage:', err);
  }

  // Fallback: get from orders store
  const orders = await listOrders();
  const matching = orders.filter(order => order.loadingDate === dateISO);
  const day = getDay(dateISO);

  return {
    assigned: matching.length,
    carrier: day?.carrier ?? '',
    orders: matching.map(order => ({
      id: order.id,
      title: order.title,
      client: order.client,
      due: order.due,
      badges: [...order.badges],
      stages: order.stages
    }))
  };
}

// Backward compatibility exports
export { getDay as get };
