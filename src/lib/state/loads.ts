import { writable, get } from 'svelte/store';
import { base } from '$app/paths';

export type Load = {
  id: string;              // '2025-11-01'
  dateISO: string;         // same as id
  carrier?: string;        // e.g. "DHL"
  notes?: string;
  pos: string[];           // PO ids assigned to this loading
  createdAt: string;
};

const isBrowser = typeof window !== 'undefined';

export const loads = writable<Load[]>([]);
export const loadsLoading = writable<boolean>(false);

/**
 * Load loading days from database
 */
export async function fetchLoads(from?: string): Promise<void> {
  if (!isBrowser) return;
  
  loadsLoading.set(true);
  try {
    const params = new URLSearchParams();
    params.set('active', 'true');
    if (from) params.set('from', from);
    
    const res = await fetch(`${base}/api/loading-days?${params}`);
    if (res.ok) {
      const data = await res.json();
      loads.set(data.map((d: any) => ({
        id: d.id || d.date,
        dateISO: d.date,
        carrier: d.carrier,
        notes: d.note,
        pos: d.pos || [],
        createdAt: d.createdAt || new Date().toISOString()
      })));
    }
  } catch (err) {
    console.error('Failed to fetch loads:', err);
  } finally {
    loadsLoading.set(false);
  }
}

export async function upsertLoad(p: Partial<Load> & { id: string }): Promise<boolean> {
  // Update local store optimistically
  loads.update(list => {
    const i = list.findIndex(x => x.id === p.id);
    const base: Load = i >= 0 ? list[i] : { id: p.id, dateISO: p.id, pos: [], createdAt: new Date().toISOString() };
    const next = { ...base, ...p };
    if (i >= 0) list[i] = next; else list.unshift(next);
    return [...list];
  });

  // Persist to database
  if (isBrowser) {
    try {
      const res = await fetch(`${base}/api/loading-days`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: p.id,
          carrier: p.carrier || '',
          note: p.notes || ''
        })
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to upsert load:', err);
      return false;
    }
  }
  return true;
}

export async function linkPO(loadId: string, po: string): Promise<boolean> {
  loads.update(list => {
    const L = list.find(l => l.id === loadId);
    if (!L) return list;
    if (!L.pos.includes(po)) L.pos = [...L.pos, po];
    return [...list];
  });

  // Persist PO link to database via calendar events API
  if (isBrowser) {
    try {
      const currentLoads = get(loads);
      const L = currentLoads.find(l => l.id === loadId);
      if (L) {
        const res = await fetch(`${base}/api/loading-days/${loadId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pos: L.pos })
        });
        return res.ok;
      }
    } catch (err) {
      console.error('Failed to link PO:', err);
      return false;
    }
  }
  return true;
}

export async function unlinkPO(loadId: string, po: string): Promise<boolean> {
  loads.update(list => {
    const L = list.find(l => l.id === loadId);
    if (!L) return list;
    L.pos = L.pos.filter(x => x !== po);
    return [...list];
  });

  // Persist PO unlink to database via calendar events API
  if (isBrowser) {
    try {
      const currentLoads = get(loads);
      const L = currentLoads.find(l => l.id === loadId);
      if (L) {
        const res = await fetch(`${base}/api/loading-days/${loadId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pos: L.pos })
        });
        return res.ok;
      }
    } catch (err) {
      console.error('Failed to unlink PO:', err);
      return false;
    }
  }
  return true;
}
