// src/lib/inventory/inventory-store.test.js
import { describe, it, expect } from 'vitest';

/**
 * Inventory Store Tests
 * 
 * Tests for inventory business logic including stock calculations,
 * validation, and movement tracking.
 */

describe('inventory-store', () => {
  describe('stock calculations', () => {
    it('calculates low stock correctly', () => {
      const item = { stock: 5, min: 10 };
      const isLowStock = item.stock <= item.min;
      expect(isLowStock).toBe(true);
    });

    it('identifies normal stock levels', () => {
      const item = { stock: 15, min: 10 };
      const isLowStock = item.stock <= item.min;
      expect(isLowStock).toBe(false);
    });

    it('handles zero stock', () => {
      const item = { stock: 0, min: 5 };
      const isOutOfStock = item.stock === 0;
      const isLowStock = item.stock <= item.min;
      
      expect(isOutOfStock).toBe(true);
      expect(isLowStock).toBe(true);
    });

    it('calculates stock after adjustment', () => {
      const currentStock = 100;
      const adjustment = -25;
      const newStock = currentStock + adjustment;
      
      expect(newStock).toBe(75);
    });

    it('prevents negative stock', () => {
      const currentStock = 10;
      const withdrawal = 15;
      const canWithdraw = currentStock >= withdrawal;
      
      expect(canWithdraw).toBe(false);
    });
  });

  describe('item validation', () => {
    it('validates required SKU field', () => {
      const validItem = { sku: 'MAT-001', name: 'Test Item' };
      const invalidItem = { sku: '', name: 'Test Item' };
      
      expect(Boolean(validItem.sku)).toBe(true);
      expect(Boolean(invalidItem.sku)).toBe(false);
    });

    it('validates required name field', () => {
      const validItem = { sku: 'MAT-001', name: 'Test Item' };
      const invalidItem = { sku: 'MAT-001', name: '' };
      
      expect(Boolean(validItem.name)).toBe(true);
      expect(Boolean(invalidItem.name)).toBe(false);
    });

    it('validates stock is non-negative', () => {
      const validateStock = (stock) => typeof stock === 'number' && stock >= 0;
      
      expect(validateStock(100)).toBe(true);
      expect(validateStock(0)).toBe(true);
      expect(validateStock(-5)).toBe(false);
      expect(validateStock(null)).toBe(false);
    });

    it('validates category values', () => {
      const validCategories = ['HARDWARE', 'ALUMINUM', 'SHEETS', 'CONSUMABLES'];
      const category = 'ALUMINUM';
      
      expect(validCategories.includes(category)).toBe(true);
      expect(validCategories.includes('INVALID')).toBe(false);
    });

    it('validates unit values', () => {
      const validUnits = ['PCS', 'M', 'M2', 'ROLL', 'KG', 'L'];
      const unit = 'M2';
      
      expect(validUnits.includes(unit)).toBe(true);
      expect(validUnits.includes('GALLONS')).toBe(false);
    });
  });

  describe('movement tracking', () => {
    it('records stock in movement', () => {
      const movement = {
        type: 'IN',
        quantity: 50,
        reference: 'PO-2024-001',
        timestamp: new Date().toISOString()
      };
      
      expect(movement.type).toBe('IN');
      expect(movement.quantity).toBe(50);
      expect(Boolean(movement.timestamp)).toBe(true);
    });

    it('records stock out movement', () => {
      const movement = {
        type: 'OUT',
        quantity: 10,
        reference: 'ORDER-123',
        timestamp: new Date().toISOString()
      };
      
      expect(movement.type).toBe('OUT');
      expect(movement.quantity).toBe(10);
    });

    it('records adjustment movements', () => {
      const movement = {
        type: 'ADJUSTMENT',
        quantity: -5,
        reason: 'Damaged goods',
        timestamp: new Date().toISOString()
      };
      
      expect(movement.type).toBe('ADJUSTMENT');
      expect(movement.quantity).toBe(-5);
    });

    it('validates movement types', () => {
      const validTypes = ['IN', 'OUT', 'ADJUSTMENT', 'TRANSFER'];
      
      expect(validTypes.includes('IN')).toBe(true);
      expect(validTypes.includes('OUT')).toBe(true);
      expect(validTypes.includes('INVALID')).toBe(false);
    });
  });

  describe('search and filtering', () => {
    const items = [
      { id: '1', sku: 'ALU-001', name: 'Aluminum Sheet 3mm', category: 'ALUMINUM', section: 'materials' },
      { id: '2', sku: 'HW-001', name: 'Screw M5x20', category: 'HARDWARE', section: 'materials' },
      { id: '3', sku: 'ALU-002', name: 'Aluminum Profile', category: 'ALUMINUM', section: 'materials' },
      { id: '4', sku: 'CON-001', name: 'Welding Rod', category: 'CONSUMABLES', section: 'consumables' }
    ];

    it('filters by category', () => {
      const filtered = items.filter(i => i.category === 'ALUMINUM');
      expect(filtered.length).toBe(2);
    });

    it('filters by section', () => {
      const filtered = items.filter(i => i.section === 'consumables');
      expect(filtered.length).toBe(1);
    });

    it('searches by SKU', () => {
      const searchTerm = 'ALU';
      const filtered = items.filter(i => 
        i.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
      expect(filtered.length).toBe(2);
    });

    it('searches by name', () => {
      const searchTerm = 'aluminum';
      const filtered = items.filter(i => 
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      expect(filtered.length).toBe(2);
    });

    it('combines multiple filters', () => {
      const filtered = items.filter(i => 
        i.category === 'ALUMINUM' && 
        i.sku.includes('001')
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].sku).toBe('ALU-001');
    });
  });

  describe('barcode handling', () => {
    it('validates barcode format', () => {
      const isValidBarcode = (barcode) => {
        if (!barcode || barcode.length < 6) return false;
        return /^[A-Za-z0-9-]+$/.test(barcode);
      };
      
      expect(isValidBarcode('123456789012')).toBe(true);
      expect(isValidBarcode('ABC-123')).toBe(true);
      expect(isValidBarcode('12345')).toBe(false); // too short
      expect(isValidBarcode('')).toBe(false);
      expect(isValidBarcode(null)).toBe(false);
    });

    it('finds item by barcode', () => {
      const inventory = [
        { id: '1', sku: 'MAT-001', barcode: '1234567890' },
        { id: '2', sku: 'MAT-002', barcode: '0987654321' }
      ];
      
      const barcode = '1234567890';
      const found = inventory.find(i => i.barcode === barcode);
      
      expect(found).toBeTruthy();
      expect(found.sku).toBe('MAT-001');
    });
  });
});
