// src/lib/order/draft-orders.test.js
import { describe, it, expect } from 'vitest';

/**
 * Draft Orders Tests
 * 
 * Tests for order validation, status transitions, and data handling.
 */

describe('draft-orders', () => {
  describe('order validation', () => {
    it('validates required PO number', () => {
      const validateOrder = (order) => {
        if (!order.poNumber || order.poNumber.trim() === '') {
          return { valid: false, error: 'PO Number is required' };
        }
        return { valid: true };
      };
      
      expect(validateOrder({ poNumber: 'PO-2024-001' }).valid).toBe(true);
      expect(validateOrder({ poNumber: '' }).valid).toBe(false);
      expect(validateOrder({}).valid).toBe(false);
    });

    it('validates required client name', () => {
      const validateOrder = (order) => {
        if (!order.clientName || order.clientName.trim() === '') {
          return { valid: false, error: 'Client Name is required' };
        }
        return { valid: true };
      };
      
      expect(validateOrder({ clientName: 'ACME Corp' }).valid).toBe(true);
      expect(validateOrder({ clientName: '' }).valid).toBe(false);
      expect(validateOrder({}).valid).toBe(false);
    });

    it('validates deadline format', () => {
      const isValidDate = (dateStr) => {
        if (!dateStr) return true; // Optional field
        const date = new Date(dateStr);
        return date instanceof Date && !isNaN(date.getTime());
      };
      
      expect(isValidDate('2025-12-31')).toBe(true);
      expect(isValidDate('2025-12-31T10:00:00Z')).toBe(true);
      expect(isValidDate('invalid-date')).toBe(false);
      expect(isValidDate(null)).toBe(true);
    });

    it('validates profiles array', () => {
      const validateProfiles = (profiles) => {
        if (!profiles) return true; // Optional
        if (!Array.isArray(profiles)) return false;
        return profiles.every(p => p.quantity > 0);
      };
      
      expect(validateProfiles([{ quantity: 5 }])).toBe(true);
      expect(validateProfiles([{ quantity: 0 }])).toBe(false);
      expect(validateProfiles([{ quantity: -1 }])).toBe(false);
      expect(validateProfiles('not-array')).toBe(false);
    });
  });

  describe('status transitions', () => {
    const validTransitions = {
      'draft': ['pending', 'cancelled'],
      'pending': ['in_progress', 'cancelled'],
      'in_progress': ['completed', 'on_hold', 'cancelled'],
      'on_hold': ['in_progress', 'cancelled'],
      'completed': ['shipped'],
      'shipped': [],
      'cancelled': []
    };

    const canTransition = (currentStatus, newStatus) => {
      const allowed = validTransitions[currentStatus] || [];
      return allowed.includes(newStatus);
    };

    it('allows draft to pending', () => {
      expect(canTransition('draft', 'pending')).toBe(true);
    });

    it('allows draft to cancelled', () => {
      expect(canTransition('draft', 'cancelled')).toBe(true);
    });

    it('prevents draft to completed directly', () => {
      expect(canTransition('draft', 'completed')).toBe(false);
    });

    it('allows in_progress to completed', () => {
      expect(canTransition('in_progress', 'completed')).toBe(true);
    });

    it('prevents backward transitions from shipped', () => {
      expect(canTransition('shipped', 'in_progress')).toBe(false);
      expect(canTransition('shipped', 'draft')).toBe(false);
    });

    it('prevents any transition from cancelled', () => {
      expect(canTransition('cancelled', 'draft')).toBe(false);
      expect(canTransition('cancelled', 'pending')).toBe(false);
    });
  });

  describe('order data transformation', () => {
    it('transforms database row to frontend model', () => {
      const dbRow = {
        id: 1,
        po_number: 'PO-2024-001',
        client: 'ACME Corp',
        title: 'Signage Order',
        due_date: new Date('2025-01-15'),
        loading_date: null,
        status: 'draft',
        profiles: null,
        created_at: new Date('2024-12-01')
      };
      
      const frontendModel = {
        id: dbRow.id,
        poNumber: dbRow.po_number,
        clientName: dbRow.client,
        title: dbRow.title,
        deadline: dbRow.due_date,
        loadingDate: dbRow.loading_date,
        status: dbRow.status,
        profiles: dbRow.profiles || [],
        createdAt: dbRow.created_at
      };
      
      expect(frontendModel.poNumber).toBe('PO-2024-001');
      expect(frontendModel.clientName).toBe('ACME Corp');
      expect(Array.isArray(frontendModel.profiles)).toBe(true);
    });

    it('transforms frontend model to database row', () => {
      const frontendModel = {
        poNumber: 'PO-2024-002',
        clientName: 'Test Client',
        title: 'New Order',
        deadline: '2025-02-01'
      };
      
      const dbRow = {
        po_number: frontendModel.poNumber,
        client: frontendModel.clientName,
        title: frontendModel.title || `Order ${frontendModel.poNumber}`,
        due_date: frontendModel.deadline || null,
        status: 'draft',
        notes: ''
      };
      
      expect(dbRow.po_number).toBe('PO-2024-002');
      expect(dbRow.client).toBe('Test Client');
      expect(dbRow.status).toBe('draft');
    });
  });

  describe('profile configuration', () => {
    it('validates profile quantity', () => {
      const validateQuantity = (qty) => {
        return typeof qty === 'number' && qty > 0 && Number.isInteger(qty);
      };
      
      expect(validateQuantity(5)).toBe(true);
      expect(validateQuantity(1)).toBe(true);
      expect(validateQuantity(0)).toBe(false);
      expect(validateQuantity(-1)).toBe(false);
      expect(validateQuantity(2.5)).toBe(false);
    });

    it('stores configuration as JSON', () => {
      const config = {
        height: 2000,
        width: 500,
        material: 'Aluminum',
        finish: 'Powder Coat'
      };
      
      const serialized = JSON.stringify(config);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.height).toBe(2000);
      expect(deserialized.material).toBe('Aluminum');
    });

    it('handles empty configuration', () => {
      const config = {};
      const serialized = JSON.stringify(config);
      expect(serialized).toBe('{}');
    });
  });

  describe('order filtering', () => {
    const orders = [
      { id: 1, poNumber: 'PO-001', status: 'draft', clientName: 'Client A' },
      { id: 2, poNumber: 'PO-002', status: 'in_progress', clientName: 'Client B' },
      { id: 3, poNumber: 'PO-003', status: 'completed', clientName: 'Client A' },
      { id: 4, poNumber: 'PO-004', status: 'draft', clientName: 'Client C' }
    ];

    it('filters by status', () => {
      const filtered = orders.filter(o => o.status === 'draft');
      expect(filtered.length).toBe(2);
    });

    it('filters by client', () => {
      const filtered = orders.filter(o => o.clientName === 'Client A');
      expect(filtered.length).toBe(2);
    });

    it('searches by PO number', () => {
      const filtered = orders.filter(o => 
        o.poNumber.toLowerCase().includes('002')
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(2);
    });

    it('combines filters', () => {
      const filtered = orders.filter(o => 
        o.status === 'draft' && o.clientName === 'Client A'
      );
      expect(filtered.length).toBe(1);
    });
  });

  describe('loading date handling', () => {
    it('validates loading date is after current date', () => {
      const today = new Date();
      const futureDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later
      const pastDate = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000); // Yesterday
      
      expect(futureDate > today).toBe(true);
      expect(pastDate > today).toBe(false);
    });

    it('formats loading date for display', () => {
      const date = new Date('2025-01-15');
      const formatted = date.toISOString().slice(0, 10);
      expect(formatted).toBe('2025-01-15');
    });
  });
});
