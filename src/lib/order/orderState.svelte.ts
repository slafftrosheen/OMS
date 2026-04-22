import type { Order, Badge, Station } from './types';
import { blankStages, STATIONS } from './stages';
import { handleApiError, retryWithBackoff } from '$lib/utils/error-handler';
import { notifySuccess, notifyError } from '$lib/notify/toast';
import { writable } from 'svelte/store';
import { authState } from '$lib/auth/authState.svelte';

const isBrowser = typeof window !== 'undefined';

export class OrderState {
  orders = $state<Order[]>([]);
  loading = $state<boolean>(false);
  lastError = $state<string | null>(null);

  constructor() {
    if (isBrowser) {
      // Automatically syncs to legacy store whenever ANY deeply nested property changes
      $effect.root(() => {
        $effect(() => {
          ordersLegacy.set(this.orders);
          loadingLegacy.set(this.loading);
          errorLegacy.set(this.lastError);
        });

        let hasLoaded = false;
        $effect(() => {
          if (!authState.loading && authState.user && !hasLoaded) {
            hasLoaded = true;
            this.load();
          }
        });
      });
    }
  }

  async load() {
    this.loading = true;
    this.lastError = null;
    try {
      const responseData = await retryWithBackoff(async () => {
        const response = await fetch('/api/draft-orders');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const rawOrders = Array.isArray(responseData) ? responseData : (responseData?.data || responseData?.orders || []);
      this.orders = rawOrders.map((d: any) => transformApiOrder(d));
    } catch (err) {
      this.lastError = handleApiError(err, 'Failed to fetch orders');
      notifyError(this.lastError);
    } finally {
      this.loading = false;
    }
  }

  addOrder(order: Order) {
    this.orders = [order, ...this.orders];
  }

  updateOrder(id: string, updated: Order) {
    const index = this.orders.findIndex(o => o.id === id);
    if (index !== -1) {
      this.orders[index] = updated;
    }
  }

  removeOrder(id: string) {
    const index = this.orders.findIndex(o => o.id === id);
    if (index !== -1) {
      this.orders.splice(index, 1);
    }
  }
}

// Module-level singleton for use by exported functions
// The constructor's isBrowser check prevents SSR side effects
export const orderState = new OrderState();

// Backward compatibility stores (only used in browser)
const ordersLegacy = writable<Order[]>([]);
const loadingLegacy = writable<boolean>(false);
const errorLegacy = writable<string | null>(null);

function syncToLegacy() {
  ordersLegacy.set(orderState.orders);
  loadingLegacy.set(orderState.loading);
  errorLegacy.set(orderState.lastError);
}

export const ordersStore = {
  subscribe: ordersLegacy.subscribe,
  set: (orders: Order[]) => { orderState.orders = orders; syncToLegacy(); },
  update: (fn: (orders: Order[]) => Order[]) => { orderState.orders = fn(orderState.orders); syncToLegacy(); }
};

export const isLoading = {
  subscribe: loadingLegacy.subscribe,
  set: (l: boolean) => { orderState.loading = l; syncToLegacy(); }
};

export const lastError = {
  subscribe: errorLegacy.subscribe,
  set: (e: string | null) => { orderState.lastError = e; syncToLegacy(); }
};

/**
 * Fetch orders from API with retry logic
 */
export async function listOrders(): Promise<Order[]> {
  await orderState.load();
  return orderState.orders;
}

/**
 * Get single order by ID
 */
export async function getOrder(id: string): Promise<Order | null> {
  if (!isBrowser) return null;
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(id)}`);
    if (response.ok) {
      const data = await response.json();
      return transformApiOrder(data);
    } else if (response.status === 404) {
      notifyError(`Order ${id} not found`);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, `Failed to fetch order ${id}`);
  }
  return null;
}

/**
 * Create new order
 */
export async function createOrder(seed: Partial<Order>): Promise<Order | null> {
  orderState.loading = true;
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
      orderState.addOrder(order);
      notifySuccess(`Order ${order.id} created successfully`);
      return order;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    const message = handleApiError(err, 'Failed to create order');
    notifyError(message);
    return null;
  } finally {
    orderState.loading = false;
  }
}

/**
 * Update order
 */
export async function updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(id)}`, {
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
      orderState.updateOrder(id, order);
      notifySuccess(`Order ${id} updated`);
      return order;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, `Failed to update order ${id}`);
    return null;
  }
}

/**
 * Delete order
 */
export async function deleteOrder(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      orderState.removeOrder(id);
      notifySuccess(`Order ${id} deleted`);
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, `Failed to delete order ${id}`);
    return false;
  }
}

/**
 * Set loading date
 */
export async function setLoadingDate(orderId: string, date: string): Promise<boolean> {
  const result = await updateOrder(orderId, { loadingDate: date });
  return result !== null;
}

/**
 * Transform API response to Order type
 */
function transformApiOrder(d: any): Order {
  return {
    id: d.poNumber || d.id,
    title: d.title || d.clientName || '',
    client: d.clientName || d.client || '',
    due: d.deadline || d.due || '',
    loadingDate: d.loadingDate || '',
    badges: (d.badges || (d.status === 'draft' ? ['DRAFT'] : [])) as Badge[],
    fields: d.fields || [],
    materials: d.materials || [],
    stages: d.stages || blankStages(),
    isDraft: d.status === 'draft',
    profiles: d.profiles || [],
    isRD: d.isRD || false,
    rdNotes: d.notes || d.rdNotes || '',
    redo: d.redo || [],
    redoReasons: d.redoReasons || {},
    redoStage: d.redoStage || '',
    redoReason: d.redoReason || '',
    progress: d.progress || {},
    cycles: d.cycles || [],
    defaultBranch: d.defaultBranch || 'main',
    branches: d.branches || [],
    prs: d.prs || [],
    revisions: d.revisions || [],
    defaultRevisionId: d.defaultRevisionId || '',
    assignees: d.assignees || {}
  };
}

/**
 * Get order synchronously from store
 */
export function getOrderSync(id: string): Order | null {
  return orderState.orders.find(o => o.id === id) || null;
}

/**
 * Change request management
 */
export async function openChangeRequest(
  orderId: string,
  payload: { title: string; message: string; proposedChanges: any }
): Promise<any | null> {
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(orderId)}/change-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const data = await response.json();
      notifySuccess('Change request created');
      return data;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, 'Failed to open change request');
    return null;
  }
}

export async function approveChangeRequest(orderId: string, crId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/draft-orders/${encodeURIComponent(orderId)}/change-requests/${encodeURIComponent(crId)}/approve`,
      { method: 'POST' }
    );
    
    if (response.ok) {
      notifySuccess('Change request approved');
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, 'Failed to approve change request');
    return false;
  }
}

export async function declineChangeRequest(orderId: string, crId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/draft-orders/${encodeURIComponent(orderId)}/change-requests/${encodeURIComponent(crId)}/decline`,
      { method: 'POST' }
    );
    
    if (response.ok) {
      notifySuccess('Change request declined');
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, 'Failed to decline change request');
    return false;
  }
}

/**
 * Set badges with backend persistence
 */
export async function setBadges(orderId: string, badges: Badge[]): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(orderId)}/badges`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badges })
    });
    
    if (response.ok) {
      const index = orderState.orders.findIndex(o => o.id === orderId);
      if (index !== -1) {
        orderState.orders[index].badges = badges;
      }
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, 'Failed to update badges');
    return false;
  }
}

/**
 * Add redo flag with backend persistence
 */
export async function addRedoFlag(orderId: string, station: string, reason: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(orderId)}/redo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station, reason, timestamp: new Date().toISOString() })
    });
    
    if (response.ok) {
      notifySuccess(`Rework added for ${station}`);
      // Refresh the order
      await getOrder(orderId);
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, 'Failed to add rework flag');
    return false;
  }
}

/**
 * Create a new blank order locally
 */
export function createNewOrder(): Order {
  const newId = `PO-${Date.now()}`;

  const initialProgress = STATIONS.reduce((acc, station) => {
    acc[station] = 0;
    return acc;
  }, {} as Record<Station, number>);

  return {
    id: newId,
    title: 'New Order',
    client: '',
    due: new Date().toISOString().slice(0, 10),
    loadingDate: '',
    badges: ['DRAFT'],
    fields: [],
    materials: [],
    stages: blankStages(),
    isDraft: true,
    profiles: [],
    isRD: false,
    rdNotes: '',
    redo: [],
    redoReasons: {},
    redoStage: '',
    redoReason: '',
    progress: initialProgress,
    cycles: [],
    defaultBranch: 'main',
    branches: [],
    prs: [],
    revisions: [],
    defaultRevisionId: '',
    assignees: {}
  };
}

/**
 * Revision management
 */
export async function addRevision(orderId: string, fileId: string, name: string): Promise<any | null> {
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(orderId)}/revisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, name })
    });
    
    if (response.ok) {
      const data = await response.json();
      notifySuccess('Revision added');
      return data;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, 'Failed to add revision');
    return null;
  }
}

export async function setDefaultRevision(orderId: string, revisionId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/draft-orders/${encodeURIComponent(orderId)}/revisions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId })
    });
    
    if (response.ok) {
      notifySuccess('Default revision updated');
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    handleApiError(err, 'Failed to set default revision');
    return false;
  }
}

/**
 * Add a badge to an order
 */
export async function addBadge(orderId: string, badge: Badge): Promise<boolean> {
  const order = getOrderSync(orderId);
  if (!order) return false;

  if (order.badges.includes(badge)) return true;

  const newBadges = [...order.badges, badge];

  // Use persistent update if possible
  if (typeof fetch !== 'undefined') {
    return await setBadges(orderId, newBadges);
  } else {
    // Fallback for tests/offline
    const index = orderState.orders.findIndex(o => o.id === orderId);
    if (index !== -1) {
      orderState.orders[index].badges = newBadges;
    }
    return true;
  }
}

/**
 * Remove a badge from an order
 */
export async function removeBadge(orderId: string, badge: Badge): Promise<boolean> {
  const order = getOrderSync(orderId);
  if (!order) return false;

  if (!order.badges.includes(badge)) return true;

  const newBadges = order.badges.filter(b => b !== badge);

  // Use persistent update if possible
  if (typeof fetch !== 'undefined') {
    return await setBadges(orderId, newBadges);
  } else {
    // Fallback for tests/offline
    const index = orderState.orders.findIndex(o => o.id === orderId);
    if (index !== -1) {
      orderState.orders[index].badges = newBadges;
    }
    return true;
  }
}
