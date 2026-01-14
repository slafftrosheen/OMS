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

// Change request management
export async function openChangeRequest(orderId: string, payload: { title: string; message: string; proposedChanges: any; }): Promise<any | null> {
  try {
    const response = await fetch(`/api/draft-orders/${orderId}/change-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok ? await response.json() : null;
  } catch (err) {
    console.error('Failed to open change request:', err);
    return null;
  }
}

export async function approveChangeRequest(orderId: string, crId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${orderId}/change-requests/${crId}/approve`, {
      method: 'POST'
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to approve change request:', err);
    return false;
  }
}

// Create a new blank order, locally
export function createNewOrder(): Order {
  const newId = `PO-${Date.now()}`;
  return {
    id: newId,
    title: 'New Order',
    client: '',
    due: new Date().toISOString().slice(0, 10),
    loadingDate: '',
    badges: ['DRAFT'],
    fields: [],
    materials: [],
    stages: {}, // You might want to initialize with blankStages()
    isDraft: true,
    profiles: [],
    isRD: false,
    rdNotes: '',
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

export async function declineChangeRequest(orderId: string, crId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${orderId}/change-requests/${crId}/decline`, {
      method: 'POST'
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to decline change request:', err);
    return false;
  }
}

// Revision management
export async function addRevision(orderId: string, fileId: string, name: string): Promise<any | null> {
  try {
    const response = await fetch(`/api/draft-orders/${orderId}/revisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, name })
    });
    return response.ok ? await response.json() : null;
  } catch (err) {
    console.error('Failed to add revision:', err);
    return null;
  }
}

export async function setDefaultRevision(orderId: string, revisionId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${orderId}/revisions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId })
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to set default revision:', err);
    return false;
  }
}

