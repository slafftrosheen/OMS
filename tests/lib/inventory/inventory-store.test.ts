import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  items,
  movements,
  loadItems,
  loadMovements,
  addItem,
  updateItem,
  removeItem,
  recordMovement,
  searchItems,
  getItem,
} from '$lib/inventory/store';
import { get } from 'svelte/store';
import type { Item, Movement } from '$lib/inventory/types';

// Mock fetch
let mockFetch;

const mockItem: Item = {
  id: 'item-1',
  sku: 'SKU001',
  name: 'Test Item',
  category: 'HARDWARE',
  section: 'materials',
  stock: 10,
  min: 5,
  unit: 'PCS',
  updatedAt: new Date().toISOString(),
  group: 'Test',
  subgroup: 'Test',
};

const mockMovement: Movement = {
  id: 'move-1',
  itemId: 'item-1',
  kind: 'IN',
  qty: 5,
  unit: 'PCS',
  at: new Date().toISOString(),
  by: 'test',
};


describe('inventory-store', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    global.window = {};
    items.set([]);
    movements.set([]);
  });

  describe('loadItems', () => {
    it('should fetch items and update the store', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([mockItem]),
      });

      const result = await loadItems();

      expect(mockFetch).toHaveBeenCalledWith('/api/inventory/items');
      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe('SKU001');
      expect(get(items)).toHaveLength(1);
    });
  });

  describe('loadMovements', () => {
    it('should fetch movements and update the store', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([mockMovement]),
        });

        const result = await loadMovements();

        expect(mockFetch).toHaveBeenCalledWith('/api/inventory/movements?limit=50');
        expect(result).toHaveLength(1);
        expect(result[0].itemId).toBe('item-1');
        expect(get(movements)).toHaveLength(1);
    });
  });

  describe('addItem', () => {
    it('should add an item and update the store', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockItem),
        });

        const newItem = await addItem({ ...mockItem, id: undefined, updatedAt: undefined });

        expect(mockFetch).toHaveBeenCalledWith('/api/inventory/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.any(String),
        });
        expect(newItem).not.toBeNull();
        expect(newItem?.sku).toBe('SKU001');
        expect(get(items)).toHaveLength(1);
    });
  });

  describe('updateItem', () => {
    it('should update an item and the store', async () => {
        items.set([mockItem]);
        const updatedItemData = { ...mockItem, name: 'Updated Name' };
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(updatedItemData),
        });

        const result = await updateItem('item-1', { name: 'Updated Name' });

        expect(mockFetch).toHaveBeenCalledWith('/api/inventory/items/item-1', expect.any(Object));
        expect(result).not.toBeNull();
        expect(result?.name).toBe('Updated Name');
        expect(get(items)[0].name).toBe('Updated Name');
    });
  });

  describe('removeItem', () => {
    it('should remove an item from the store', async () => {
        items.set([mockItem]);
        mockFetch.mockResolvedValue({ ok: true });

        const result = await removeItem('item-1');

        expect(mockFetch).toHaveBeenCalledWith('/api/inventory/items/item-1', { method: 'DELETE' });
        expect(result).toBe(true);
        expect(get(items)).toHaveLength(0);
    });
  });

  describe('recordMovement', () => {
    it('should record a movement and update item stock', async () => {
        items.set([mockItem]);
        const newStock = mockItem.stock + 5;
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ id: 'move-2', newStock, unit: 'PCS' }),
        });

        const result = await recordMovement('item-1', 'IN', 5);

        expect(mockFetch).toHaveBeenCalledWith('/api/inventory/movements', expect.any(Object));
        expect(result).not.toBeNull();
        expect(get(items)[0].stock).toBe(newStock);
        expect(get(movements)).toHaveLength(1);
    });
  });

  describe('searchItems', () => {
    it('should find items by SKU', () => {
        items.set([mockItem, { ...mockItem, id: 'item-2', sku: 'SKU002' }]);
        const result = searchItems('SKU001');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('item-1');
    });

    it('should return all items for empty query', () => {
        items.set([mockItem, { ...mockItem, id: 'item-2', sku: 'SKU002' }]);
        const result = searchItems('');
        expect(result).toHaveLength(2);
    });
  });

  describe('getItem', () => {
    it('should retrieve an item by its ID', () => {
        items.set([mockItem]);
        const result = getItem('item-1');
        expect(result).toEqual(mockItem);
    });

    it('should return null if item not found', () => {
        items.set([mockItem]);
        const result = getItem('item-2');
        expect(result).toBeNull();
    });
  });
});
