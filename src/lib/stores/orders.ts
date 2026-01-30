import { writable, derived, get } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';

export interface Order {
  id: string;
  po_number: string;
  title: string;
  client: string;
  due_date: string;
  loading_date?: string;
  is_rd: boolean;
  rd_notes?: string;
  badges: string[];
  status: 'draft' | 'active' | 'completed' | 'cancelled' | 'on_hold';
  priority: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // From order_summary view
  completed_stages?: number;
  in_progress_stages?: number;
  blocked_stages?: number;
  rework_stages?: number;
  total_stages?: number;
  progress_percentage?: number;
  days_until_due?: number;
  total_rework_count?: number;
  current_station?: string;
  assignee_count?: number;
}

export interface OrderDetail extends Order {
  stages?: any[];
  materials?: any[];
  fields?: any[];
  assignees?: any[];
  rework_cycles?: any[];
  revisions?: any[];
  activity_log?: any[];
}

interface OrdersState {
  items: Order[];
  loading: boolean;
  error: string | null;
  total: number;
  currentPage: number;
  pageSize: number;
  filters: OrderFilters;
}

interface OrderFilters {
  status?: string | string[];
  station?: string;
  search?: string;
  is_rd?: boolean;
  loading_date?: string;
  priority?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// Create base store
function createOrdersStore() {
  const initialState: OrdersState = {
    items: [],
    loading: false,
    error: null,
    total: 0,
    currentPage: 1,
    pageSize: 50,
    filters: {}
  };

  const store: Writable<OrdersState> = writable(initialState);
  const { subscribe, set, update } = store;

  // Build query params from filters
  function buildQueryParams(state: OrdersState): URLSearchParams {
    const params = new URLSearchParams();

    const offset = (state.currentPage - 1) * state.pageSize;
    params.set('limit', state.pageSize.toString());
    params.set('offset', offset.toString());

    if (state.filters.status) {
      if (Array.isArray(state.filters.status)) {
        params.set('status', state.filters.status.join(','));
      } else {
        params.set('status', state.filters.status);
      }
    }
    if (state.filters.station) params.set('station', state.filters.station);
    if (state.filters.search) params.set('search', state.filters.search);
    if (state.filters.is_rd !== undefined) params.set('is_rd', state.filters.is_rd.toString());
    if (state.filters.loading_date) params.set('loading_date', state.filters.loading_date);
    if (state.filters.priority !== undefined) params.set('priority', state.filters.priority.toString());
    if (state.filters.sort) params.set('sort_by', state.filters.sort);
    if (state.filters.order) params.set('order', state.filters.order);

    return params;
  }

  return {
    subscribe,

    // Set sorting
    async setSort(sort: { field: string; direction: 'asc' | 'desc' }) {
      update(state => ({
        ...state,
        filters: { ...state.filters, sort: sort.field, order: sort.direction }
      }));
      await this.load();
    },

    setOrders(items: Order[]) {
      update(state => ({ ...state, items, total: items.length, loading: false, error: null }));
    },

    setError(error: string) {
      update(state => ({ ...state, error, loading: false }));
    },

    // Load orders with current filters
    async load() {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const state = get(store);
        const params = buildQueryParams(state);

        const response = await fetch(`/api/orders?${params}`);
        if (!response.ok) throw new Error('Failed to fetch orders');

        const result = await response.json();

        update(s => ({
          ...s,
          items: result.data,
          total: result.count,
          loading: false
        }));
      } catch (err: any) {
        update(state => ({
          ...state,
          loading: false,
          error: err.message
        }));
      }
    },

    // Create new order
    async create(orderData: Partial<Order>) {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to create order');
        }

        const newOrder = await response.json();

        update(state => ({
          ...state,
          items: [newOrder, ...state.items],
          total: state.total + 1,
          loading: false
        }));

        return newOrder;
      } catch (err: any) {
        update(state => ({
          ...state,
          loading: false,
          error: err.message
        }));
        throw err;
      }
    },

    // Update order
    async update(id: string, updates: Partial<Order>) {
      try {
        const response = await fetch(`/api/orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });

        if (!response.ok) throw new Error('Failed to update order');

        const updatedOrder = await response.json();

        update(state => ({
          ...state,
          items: state.items.map(o => o.id === id ? { ...o, ...updatedOrder } : o)
        }));

        return updatedOrder;
      } catch (err: any) {
        update(state => ({ ...state, error: err.message }));
        throw err;
      }
    },

    // Delete (cancel) order
    async delete(id: string) {
      try {
        const response = await fetch(`/api/orders/${id}`, {
          method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete order');

        update(state => ({
          ...state,
          items: state.items.filter(o => o.id !== id),
          total: state.total - 1
        }));
      } catch (err: any) {
        update(state => ({ ...state, error: err.message }));
        throw err;
      }
    },

    // Set filters and reload
    async setFilters(filters: OrderFilters) {
      update(state => ({
        ...state,
        filters: { ...state.filters, ...filters },
        currentPage: 1 // Reset to first page
      }));
      await this.load();
    },

    // Clear filters
    async clearFilters() {
      update(state => ({
        ...state,
        filters: {},
        currentPage: 1
      }));
      await this.load();
    },

    // Pagination
    async setPage(page: number) {
      update(state => ({ ...state, currentPage: page }));
      await this.load();
    },

    async nextPage() {
      const state = get(store);
      const maxPage = Math.ceil(state.total / state.pageSize);
      if (state.currentPage < maxPage) {
        await this.setPage(state.currentPage + 1);
      }
    },

    async prevPage() {
      const state = get(store);
      if (state.currentPage > 1) {
        await this.setPage(state.currentPage - 1);
      }
    },

    // Get single order by ID
    getById(id: string): Order | undefined {
      return get(store).items.find(o => o.id === id);
    },

    // Reset store
    reset() {
      set(initialState);
    }
  };
}

export const ordersStore = createOrdersStore();

// Derived stores for filtered views
export const activeOrders: Readable<Order[]> = derived(
  ordersStore,
  $orders => $orders.items.filter(o => o.status === 'active')
);

export const blockedOrders: Readable<Order[]> = derived(
  ordersStore,
  $orders => $orders.items.filter(o => (o.blocked_stages || 0) > 0)
);

export const rdOrders: Readable<Order[]> = derived(
  ordersStore,
  $orders => $orders.items.filter(o => o.is_rd)
);

export const overdueOrders: Readable<Order[]> = derived(
  ordersStore,
  $orders => $orders.items.filter(o => (o.days_until_due || 0) < 0)
);

// Exports for compatibility with OrderList.svelte
export const filteredOrders: Readable<Order[]> = derived(
  ordersStore,
  $orders => $orders.items
);

export const orderStats: Readable<{total: number; active: number; completed: number; overdue: number}> = derived(
  ordersStore,
  $orders => ({
    total: $orders.total,
    active: $orders.items.filter(o => o.status === 'active').length,
    completed: $orders.items.filter(o => o.status === 'completed').length,
    overdue: $orders.items.filter(o => (o.days_until_due || 0) < 0).length
  })
);
