import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { OrderDetail } from './orders';

interface OrderDetailState {
  order: OrderDetail | null;
  loading: boolean;
  error: string | null;
}

function createOrderDetailStore() {
  const initialState: OrderDetailState = {
    order: null,
    loading: false,
    error: null
  };

  const store: Writable<OrderDetailState> = writable(initialState);
  const { subscribe, set, update } = store;

  return {
    subscribe,

    // Load single order with all relations
    async load(id: string) {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const response = await fetch(`/api/orders/${id}`);
        if (!response.ok) throw new Error('Failed to fetch order');

        const order = await response.json();

        update(state => ({
          ...state,
          order,
          loading: false
        }));

        return order;
      } catch (err: any) {
        update(state => ({
          ...state,
          loading: false,
          error: err.message
        }));
        throw err;
      }
    },

    // Update stage
    async updateStage(orderId: string, station: string, updates: any) {
      try {
        const response = await fetch(`/api/orders/${orderId}/stages?station=${station}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });

        if (!response.ok) throw new Error('Failed to update stage');

        const updatedStage = await response.json();

        // Update stage in store
        update(state => {
          if (!state.order) return state;

          const stages = state.order.stages?.map(s =>
            s.station === station ? updatedStage : s
          ) || [];

          return {
            ...state,
            order: { ...state.order, stages }
          };
        });

        return updatedStage;
      } catch (err: any) {
        update(state => ({ ...state, error: err.message }));
        throw err;
      }
    },

    // Add rework cycle
    async addRework(orderId: string, reworkData: any) {
      try {
        const response = await fetch(`/api/orders/${orderId}/rework`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reworkData)
        });

        if (!response.ok) throw new Error('Failed to add rework');

        const newRework = await response.json();

        // Add to store
        update(state => {
          if (!state.order) return state;

          const rework_cycles = [newRework, ...(state.order.rework_cycles || [])];

          return {
            ...state,
            order: { ...state.order, rework_cycles }
          };
        });

        return newRework;
      } catch (err: any) {
        update(state => ({ ...state, error: err.message }));
        throw err;
      }
    },

    // Resolve rework
    async resolveRework(orderId: string, reworkId: string, resolutionNotes: string) {
      try {
        const response = await fetch(`/api/orders/${orderId}/rework?rework_id=${reworkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolution_notes: resolutionNotes })
        });

        if (!response.ok) throw new Error('Failed to resolve rework');

        const resolvedRework = await response.json();

        // Update in store
        update(state => {
          if (!state.order) return state;

          const rework_cycles = state.order.rework_cycles?.map(r =>
            r.id === reworkId ? resolvedRework : r
          ) || [];

          return {
            ...state,
            order: { ...state.order, rework_cycles }
          };
        });

        return resolvedRework;
      } catch (err: any) {
        update(state => ({ ...state, error: err.message }));
        throw err;
      }
    },

    // Clear current order
    clear() {
      set(initialState);
    }
  };
}

export const orderDetailStore = createOrderDetailStore();
