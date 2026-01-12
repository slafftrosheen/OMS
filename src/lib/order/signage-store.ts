import type { Order, Badge } from './types';
import { writable, get } from 'svelte/store';

// Store for orders
export const ordersStore = writable<Order[]>([]);
export const isLoading = writable<boolean>(false);

// Fetch orders from API
export async function listOrders(): Promise<Order[]> {
  if (typeof window === 'undefined') return [];
  
  isLoading.set(true);
  try {
    const response = await fetch('/api/draft-orders');
    if (response.ok) {
      const data = await response.json();
      const orders = data.map((d: any) => transformApiOrder(d));
      ordersStore.set(orders);
      return orders;
    }
  } catch (err) {
    console.error('Failed to fetch orders:', err);
  } finally {
    isLoading.set(false);
  }
  return [];
}

// Get single order by ID
export async function getOrder(id: string): Promise<Order | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    const response = await fetch(`/api/draft-orders/${id}`);
    if (response.ok) {
      const data = await response.json();
      return transformApiOrder(data);
    }
  } catch (err) {
    console.error('Failed to fetch order:', err);
  }
  return null;
}

// Create new order
export async function createOrder(seed: Partial<Order>): Promise<Order | null> {
  try {
    const response = await fetch('/api/draft-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poNumber: seed.id,
        clientName: seed.client,
        title: seed.title,
        deadline: seed.due,
        notes: seed.rdNotes,
        profiles: seed.profiles || []
      })
    });

    if (response.ok) {
      const data = await response.json();
      const order = transformApiOrder(data);
      ordersStore.update(orders => [order, ...orders]);
      return order;
    }
  } catch (err) {
    console.error('Failed to create order:', err);
  }
  return null;
}

// Update order
export async function updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
  try {
    const response = await fetch(`/api/draft-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: updates.client,
        title: updates.title,
        due: updates.due,
        loadingDate: updates.loadingDate,
        status: updates.isDraft ? 'draft' : 'pending',
        notes: updates.rdNotes,
        profiles: updates.profiles
      })
    });

    if (response.ok) {
      const data = await response.json();
      const order = transformApiOrder(data);
      ordersStore.update(orders =>
        orders.map(o => o.id === id ? { ...o, ...order } : o)
      );
      return order;
    }
  } catch (err) {
    console.error('Failed to update order:', err);
  }
  return null;
}

// Delete order
export async function deleteOrder(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      ordersStore.update(orders => orders.filter(o => o.id !== id));
      return true;
    }
  } catch (err) {
    console.error('Failed to delete order:', err);
  }
  return false;
}

// Set loading date
export async function setLoadingDate(orderId: string, date: string): Promise<boolean> {
  const result = await updateOrder(orderId, { loadingDate: date });
  return result !== null;
}

// Badge management
export async function setBadges(orderId: string, badges: Badge[]): Promise<boolean> {
  // Badges are derived from status in the API, update via order update
  ordersStore.update(orders =>
    orders.map(o => o.id === orderId ? { ...o, badges } : o)
  );
  return true;
}

export async function addBadge(orderId: string, badge: Badge): Promise<boolean> {
  const orders = get(ordersStore);
  const order = orders.find(o => o.id === orderId);
  if (!order) return false;
  
  const newBadges = [...order.badges, badge];
  return setBadges(orderId, newBadges);
}

export async function removeBadge(orderId: string, badge: Badge): Promise<boolean> {
  const orders = get(ordersStore);
  const order = orders.find(o => o.id === orderId);
  if (!order) return false;
  
  const newBadges = order.badges.filter(b => b !== badge);
  return setBadges(orderId, newBadges);
}

// Transform API response to Order type
function transformApiOrder(d: any): Order {
  return {
    id: d.poNumber || d.id,
    title: d.title || d.clientName || '',
    client: d.clientName || d.client || '',
    due: d.deadline || d.due || '',
    loadingDate: d.loadingDate || '',
    badges: d.status === 'draft' ? ['DRAFT'] : [],
    fields: [],
    materials: [],
    stages: {},
    isDraft: d.status === 'draft',
    profiles: d.profiles || [],
    isRD: false,
    rdNotes: d.notes || '',
    redo: [],
    redoReasons: {},
    redoStage: '',
    redoReason: '',
    progress: {},
    cycles: [],
    branches: [],
    prs: [],
    revisions: [],
    defaultRevisionId: ''
  };
}

// Get order synchronously from store (for compatibility with existing code)
export function getOrderSync(id: string): Order | null {
  const orders = get(ordersStore);
  return orders.find(o => o.id === id) || null;
}

// Change request management (local store operations)
let changeRequestCounter = 0;

export function openChangeRequest(orderId: string, payload: {
  title: string;
  author: string;
  message: string;
  proposed: any;
}): string {
  const prId = `PR-${++changeRequestCounter}`;
  
  ordersStore.update(orders =>
    orders.map(o => {
      if (o.id !== orderId) return o;
      const pr = {
        id: prId,
        ...payload,
        status: 'pending' as const,
        createdAt: new Date().toISOString()
      };
      return { ...o, prs: [...(o.prs || []), pr] };
    })
  );
  
  return prId;
}

export function approveChangeRequest(orderId: string, prId: string, approver = 'admin'): boolean {
  ordersStore.update(orders =>
    orders.map(o => {
      if (o.id !== orderId) return o;
      
      const pr = o.prs?.find(p => p.id === prId);
      if (!pr || pr.status !== 'pending') return o;
      
      // Apply proposed changes
      const proposed = pr.proposed || {};
      const stages = { ...o.stages, ...proposed.stages };
      const cycles = proposed.cycles || o.cycles;
      
      // Update PR status
      const prs = o.prs.map(p =>
        p.id === prId ? { ...p, status: 'approved' as const, approvedAt: new Date().toISOString(), approver } : p
      );
      
      return { ...o, stages, cycles, prs };
    })
  );
  
  return true;
}

export function declineChangeRequest(orderId: string, prId: string, decliner = 'admin'): boolean {
  ordersStore.update(orders =>
    orders.map(o => {
      if (o.id !== orderId) return o;
      
      const prs = o.prs?.map(p =>
        p.id === prId ? { ...p, status: 'declined' as const, declinedAt: new Date().toISOString(), decliner } : p
      );
      
      return { ...o, prs };
    })
  );
  
  return true;
}

// Revision management
export function addRevision(orderId: string, file: any): string {
  const revId = `REV-${Date.now()}`;
  
  ordersStore.update(orders =>
    orders.map(o => {
      if (o.id !== orderId) return o;
      const revision = {
        id: revId,
        name: file.name,
        file,
        createdAt: new Date().toISOString()
      };
      return { ...o, revisions: [...(o.revisions || []), revision] };
    })
  );
  
  return revId;
}

export function setDefaultRevision(orderId: string, revId: string): boolean {
  ordersStore.update(orders =>
    orders.map(o => o.id === orderId ? { ...o, defaultRevisionId: revId } : o)
  );
  return true;
}

// Rework management
export function setRedoSelection(orderId: string, stage: string, reason: string): void {
  ordersStore.update(orders =>
    orders.map(o => o.id === orderId ? { ...o, redoStage: stage, redoReason: reason } : o)
  );
}

export function addRedoFlag(orderId: string, stage: string, reason: string): string[] {
  let newRedo: string[] = [];
  ordersStore.update(orders =>
    orders.map(o => {
      if (o.id !== orderId) return o;
      newRedo = [...(o.redo || []), stage];
      const redoReasons = { ...(o.redoReasons || {}), [stage]: reason };
      return { ...o, redo: newRedo, redoReasons };
    })
  );
  return newRedo;
}

export function clearRedoFlag(orderId: string, stage: string): string[] {
  let newRedo: string[] = [];
  ordersStore.update(orders =>
    orders.map(o => {
      if (o.id !== orderId) return o;
      newRedo = (o.redo || []).filter(s => s !== stage);
      const redoReasons = { ...(o.redoReasons || {}) };
      delete redoReasons[stage];
      return { ...o, redo: newRedo, redoReasons };
    })
  );
  return newRedo;
}
