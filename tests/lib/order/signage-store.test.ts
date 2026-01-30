import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  ordersStore,
  listOrders,
  createOrder,
  getOrder,
  updateOrder,
  deleteOrder,
  setLoadingDate,
  addBadge,
  removeBadge
} from '$lib/order/signage-store';
import { get } from 'svelte/store';
import type { Order } from '$lib/order/types';

// Mock fetch
let mockFetch;

const mockApiOrder = {
  id: 'PO-123',
  poNumber: 'PO-123',
  clientName: 'Test Client',
  title: 'Test Order',
  deadline: '2025-01-01',
  status: 'pending',
  loadingDate: '',
  profiles: [],
  notes: '',
};

const mockTransformedOrder: Order = {
  id: 'PO-123',
  title: 'Test Order',
  client: 'Test Client',
  due: '2025-01-01',
  loadingDate: '',
  badges: [],
  fields: [],
  materials: [],
  stages: {
    CAD: { status: 'idle', label: 'CAD', color: 'gray' },
    CNC: { status: 'idle', label: 'CNC', color: 'gray' },
    QC: { status: 'idle', label: 'QC', color: 'gray' },
    SANDING: { status: 'idle', label: 'SANDING', color: 'gray' },
    ASSEMBLY: { status: 'idle', label: 'ASSEMBLY', color: 'gray' },
    PAINTING: { status: 'idle', label: 'PAINTING', color: 'gray' },
    PACKING: { status: 'idle', label: 'PACKING', color: 'gray' },
    SHIPPING: { status: 'idle', label: 'SHIPPING', color: 'gray' },
    INSTALLATION: { status: 'idle', label: 'INSTALLATION', color: 'gray' },
    INVOICING: { status: 'idle', label: 'INVOICING', color: 'gray' },
    DONE: { status: 'idle', label: 'DONE', color: 'gray' }
  },
  isDraft: false,
  profiles: [],
  isRD: false,
  rdNotes: '',
  redo: [],
  redoReasons: {},
  redoStage: '',
  redoReason: '',
  progress: {
    CAD: 0,
    CNC: 0,
    QC: 0,
    SANDING: 0,
    ASSEMBLY: 0,
    PAINTING: 0,
    PACKING: 0,
    SHIPPING: 0,
    INSTALLATION: 0,
    INVOICING: 0,
    DONE: 0
  },
  cycles: [],
  branches: [],
  prs: [],
  revisions: [],
  defaultRevisionId: '',
};


describe('signage-store', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    global.window = {} as any;
    ordersStore.set([]);
  });

  describe('listOrders', () => {
    it('should fetch orders and update the store', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([mockApiOrder]),
      });

      const orders = await listOrders();

      expect(mockFetch).toHaveBeenCalledWith('/api/draft-orders');
      expect(orders).toHaveLength(1);
      expect(orders[0].id).toBe('PO-123');
      expect(get(ordersStore)).toHaveLength(1);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const orders = await listOrders();

      expect(orders).toEqual([]);
      expect(get(ordersStore)).toEqual([]);
    });
  });

  describe('createOrder', () => {
    it('should create an order and update the store', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiOrder),
      });

      const newOrder = await createOrder({
        id: 'PO-123',
        client: 'Test Client',
        title: 'Test Order',
        due: '2025-01-01',
        profiles: [],
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/draft-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      });

      expect(newOrder).not.toBeNull();
      expect(newOrder?.id).toBe('PO-123');
      expect(get(ordersStore)).toHaveLength(1);
    });
  });

  describe('getOrder', () => {
    it('should fetch a single order by ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiOrder),
      });

      const order = await getOrder('PO-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/draft-orders/PO-123');
      expect(order).not.toBeNull();
      expect(order?.id).toBe('PO-123');
    });
  });

  describe('updateOrder', () => {
    it('should update an order and the store', async () => {
      ordersStore.set([mockTransformedOrder]);
      const updatedApiOrder = { ...mockApiOrder, title: 'Updated Order' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedApiOrder),
      });

      const updatedOrder = await updateOrder('PO-123', { title: 'Updated Order' });

      expect(mockFetch).toHaveBeenCalledWith('/api/draft-orders/PO-123', expect.any(Object));
      expect(updatedOrder).not.toBeNull();
      expect(updatedOrder?.title).toBe('Updated Order');
      const storeOrder = get(ordersStore).find((o) => o.id === 'PO-123');
      expect(storeOrder?.title).toBe('Updated Order');
    });
  });

  describe('deleteOrder', () => {
    it('should delete an order and remove it from the store', async () => {
      ordersStore.set([mockTransformedOrder]);
      mockFetch.mockResolvedValue({ ok: true });

      const result = await deleteOrder('PO-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/draft-orders/PO-123', { method: 'DELETE' });
      expect(result).toBe(true);
      expect(get(ordersStore)).toHaveLength(0);
    });
  });

  describe('setLoadingDate', () => {
    it('should update the loading date of an order', async () => {
      ordersStore.set([mockTransformedOrder]);
      const newLoadingDate = '2025-02-01';
      const updatedApiOrder = { ...mockApiOrder, loadingDate: newLoadingDate };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedApiOrder),
      });

      const result = await setLoadingDate('PO-123', newLoadingDate);

      expect(result).toBe(true);
      const storeOrder = get(ordersStore).find((o) => o.id === 'PO-123');
      expect(storeOrder?.loadingDate).toBe(newLoadingDate);
    });
  });

  describe('badge management', () => {
    beforeEach(() => {
        // Ensure mock is set up for this suite
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockApiOrder),
        });
    });

    it('should add a badge to an order', async () => {
      ordersStore.set([mockTransformedOrder]);
      await addBadge('PO-123', 'URGENT');
      const storeOrder = get(ordersStore).find((o) => o.id === 'PO-123');
      expect(storeOrder?.badges).toContain('URGENT');
    });

    it('should remove a badge from an order', async () => {
      const orderWithBadge = { ...mockTransformedOrder, badges: ['URGENT'] as any };
      ordersStore.set([orderWithBadge]);
      await removeBadge('PO-123', 'URGENT');
      const storeOrder = get(ordersStore).find((o) => o.id === 'PO-123');
      expect(storeOrder?.badges).not.toContain('URGENT');
    });
  });
});
