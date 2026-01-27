// src/lib/stores/orders.ts
import { writable, derived } from 'svelte/store';

export interface Order {
    id: string;
    title: string;
    client: string;
    description?: string;
    status: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
    stages: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'SKIPPED'>;
    due_date: string;
    created_at: string;
    completed_at?: string;
    price?: number;
    rework_count: number;
    assigned_to?: string[];
    created_by: string;
}

interface OrdersState {
    orders: Order[];
    loading: boolean;
    error: string | null;
    filters: {
        status?: string[];
        search?: string;
        dateFrom?: string;
        dateTo?: string;
    };
    sort: {
        field: 'created_at' | 'due_date' | 'title' | 'status';
        direction: 'asc' | 'desc';
    };
}

function createOrdersStore() {
    const { subscribe, set, update } = writable<OrdersState>({
        orders: [],
        loading: false,
        error: null,
        filters: {},
        sort: { field: 'created_at', direction: 'desc' }
    });

    return {
        subscribe,
        setOrders: (orders: Order[]) => {
            update(state => ({ ...state, orders, loading: false, error: null }));
        },
        setLoading: (loading: boolean) => {
            update(state => ({ ...state, loading }));
        },
        setError: (error: string | null) => {
            update(state => ({ ...state, error, loading: false }));
        },
        addOrder: (order: Order) => {
            update(state => ({
                ...state,
                orders: [order, ...state.orders]
            }));
        },
        updateOrder: (id: string, updates: Partial<Order>) => {
            update(state => ({
                ...state,
                orders: state.orders.map(o => 
                    o.id === id ? { ...o, ...updates } : o
                )
            }));
        },
        removeOrder: (id: string) => {
            update(state => ({
                ...state,
                orders: state.orders.filter(o => o.id !== id)
            }));
        },
        setFilters: (filters: OrdersState['filters']) => {
            update(state => ({ ...state, filters }));
        },
        setSort: (sort: OrdersState['sort']) => {
            update(state => ({ ...state, sort }));
        },
        reset: () => {
            set({
                orders: [],
                loading: false,
                error: null,
                filters: {},
                sort: { field: 'created_at', direction: 'desc' }
            });
        }
    };
}

export const orders = createOrdersStore();

// Derived stores
export const filteredOrders = derived(orders, $orders => {
    let filtered = [...$orders.orders];

    // Apply status filter
    if ($orders.filters.status && $orders.filters.status.length > 0) {
        filtered = filtered.filter(o => 
            $orders.filters.status!.includes(o.status)
        );
    }

    // Apply search filter
    if ($orders.filters.search) {
        const search = $orders.filters.search.toLowerCase();
        filtered = filtered.filter(o =>
            o.title.toLowerCase().includes(search) ||
            o.client.toLowerCase().includes(search) ||
            o.description?.toLowerCase().includes(search)
        );
    }

    // Apply date filters
    if ($orders.filters.dateFrom) {
        filtered = filtered.filter(o => 
            new Date(o.created_at) >= new Date($orders.filters.dateFrom!)
        );
    }

    if ($orders.filters.dateTo) {
        filtered = filtered.filter(o => 
            new Date(o.created_at) <= new Date($orders.filters.dateTo!)
        );
    }

    // Apply sorting
    filtered.sort((a, b) => {
        const field = $orders.sort.field;
        const aVal = a[field];
        const bVal = b[field];

        if (aVal === bVal) return 0;

        const comparison = aVal < bVal ? -1 : 1;
        return $orders.sort.direction === 'asc' ? comparison : -comparison;
    });

    return filtered;
});

export const orderStats = derived(orders, $orders => {
    const stats = {
        total: $orders.orders.length,
        active: 0,
        completed: 0,
        onHold: 0,
        cancelled: 0,
        overdue: 0
    };

    const now = new Date();

    $orders.orders.forEach(order => {
        switch (order.status) {
            case 'ACTIVE':
                stats.active++;
                if (new Date(order.due_date) < now) {
                    stats.overdue++;
                }
                break;
            case 'COMPLETED':
                stats.completed++;
                break;
            case 'ON_HOLD':
                stats.onHold++;
                break;
            case 'CANCELLED':
                stats.cancelled++;
                break;
        }
    });

    return stats;
});