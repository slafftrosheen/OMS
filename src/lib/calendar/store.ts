import type { CalEvent } from './types';
import { writable, get } from 'svelte/store';
import { base } from '$app/paths';

const isBrowser = typeof window !== 'undefined';

export const calEvents = writable<CalEvent[]>([]);
export const calendarLoading = writable<boolean>(false);

/**
 * Load events from database
 */
export async function loadEvents(from?: string, to?: string): Promise<void> {
  if (!isBrowser) return;
  
  calendarLoading.set(true);
  try {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    
    const res = await fetch(`${base}/api/calendar?${params}`);
    if (res.ok) {
      const events = await res.json();
      calEvents.set(events);
    }
  } catch (err) {
    console.error('Failed to load calendar events:', err);
  } finally {
    calendarLoading.set(false);
  }
}

/**
 * Add event to database
 */
export async function addEvent(e: CalEvent): Promise<CalEvent | null> {
  if (!isBrowser) return null;
  
  try {
    const res = await fetch(`${base}/api/calendar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(e)
    });
    
    if (res.ok) {
      const created = await res.json();
      calEvents.update(list => [created, ...list]);
      return created;
    }
  } catch (err) {
    console.error('Failed to add event:', err);
  }
  return null;
}

/**
 * Update event in database
 */
export async function updateEvent(e: CalEvent): Promise<boolean> {
  if (!isBrowser) return false;
  
  try {
    const res = await fetch(`${base}/api/calendar/${e.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(e)
    });
    
    if (res.ok) {
      calEvents.update(list => list.map(x => x.id === e.id ? e : x));
      return true;
    }
  } catch (err) {
    console.error('Failed to update event:', err);
  }
  return false;
}

/**
 * Remove event from database
 */
export async function removeEvent(id: string): Promise<boolean> {
  if (!isBrowser) return false;
  
  try {
    const res = await fetch(`${base}/api/calendar/${id}`, { method: 'DELETE' });
    
    if (res.ok) {
      calEvents.update(list => list.filter(x => x.id !== id));
      return true;
    }
  } catch (err) {
    console.error('Failed to remove event:', err);
  }
  return false;
}

/**
 * Get events by date (from current store state)
 */
export function byDate(iso: string): CalEvent[] { 
  let out: CalEvent[] = []; 
  const unsub = calEvents.subscribe(v => { out = v.filter(e => e.date === iso); });
  unsub();
  return out; 
}
