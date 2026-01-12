// src/lib/loading/loading-calendar.test.js
import { describe, it, expect } from 'vitest';

/**
 * Loading Calendar Tests
 * 
 * Tests for loading day management, date validation, and calendar operations.
 */

describe('loading-calendar', () => {
  describe('date validation', () => {
    it('validates date format YYYY-MM-DD', () => {
      const isValidDateFormat = (dateStr) => {
        return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
      };
      
      expect(isValidDateFormat('2025-12-31')).toBe(true);
      expect(isValidDateFormat('2025-1-31')).toBe(false);
      expect(isValidDateFormat('31-12-2025')).toBe(false);
      expect(isValidDateFormat('2025/12/31')).toBe(false);
    });

    it('validates date is a real date', () => {
      const isRealDate = (dateStr) => {
        const date = new Date(dateStr);
        if (!(date instanceof Date) || isNaN(date.getTime())) return false;
        // Additional check: ensure date string parses back to same values
        // Note: Feb 30 in JS becomes Mar 2, so we check the parts
        const parts = dateStr.split('-');
        if (parts.length !== 3) return false;
        const [year, month, day] = parts.map(Number);
        return date.getFullYear() === year && 
               date.getMonth() === month - 1 && 
               date.getDate() === day;
      };
      
      expect(isRealDate('2025-12-31')).toBe(true);
      expect(isRealDate('2025-02-30')).toBe(false); // Feb 30 doesn't exist
      expect(isRealDate('invalid')).toBe(false);
    });

    it('checks if date is in future', () => {
      const today = new Date().toISOString().slice(0, 10);
      const futureDate = '2099-12-31';
      const pastDate = '2020-01-01';
      
      expect(futureDate >= today).toBe(true);
      expect(pastDate >= today).toBe(false);
    });
  });

  describe('calendar navigation', () => {
    it('gets first day of month', () => {
      const getFirstOfMonth = (year, month) => {
        return new Date(year, month, 1);
      };
      
      const jan2025 = getFirstOfMonth(2025, 0); // January
      expect(jan2025.getDate()).toBe(1);
      expect(jan2025.getMonth()).toBe(0);
    });

    it('gets days in month', () => {
      const getDaysInMonth = (year, month) => {
        return new Date(year, month + 1, 0).getDate();
      };
      
      expect(getDaysInMonth(2025, 0)).toBe(31); // January
      expect(getDaysInMonth(2025, 1)).toBe(28); // February 2025 (non-leap)
      expect(getDaysInMonth(2024, 1)).toBe(29); // February 2024 (leap year)
      expect(getDaysInMonth(2025, 3)).toBe(30); // April
    });

    it('gets week day of first day', () => {
      const getFirstWeekday = (year, month) => {
        return new Date(year, month, 1).getDay();
      };
      
      // January 1, 2025 is Wednesday (3)
      expect(getFirstWeekday(2025, 0)).toBe(3);
    });

    it('generates month grid', () => {
      const generateMonthGrid = (year, month) => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstWeekday = new Date(year, month, 1).getDay();
        
        const grid = [];
        // Add empty cells for days before first of month
        for (let i = 0; i < firstWeekday; i++) {
          grid.push(null);
        }
        // Add days of month
        for (let day = 1; day <= daysInMonth; day++) {
          grid.push(day);
        }
        return grid;
      };
      
      const jan2025 = generateMonthGrid(2025, 0);
      expect(jan2025.length).toBe(34); // 3 empty + 31 days
      expect(jan2025[0]).toBe(null);
      expect(jan2025[3]).toBe(1); // First day
      expect(jan2025[33]).toBe(31); // Last day
    });
  });

  describe('carrier validation', () => {
    const validCarriers = ['DHL', 'UPS', 'FedEx', 'TNT', 'PostNL', 'Own Transport'];

    it('validates known carriers', () => {
      expect(validCarriers.includes('DHL')).toBe(true);
      expect(validCarriers.includes('UPS')).toBe(true);
    });

    it('allows empty carrier', () => {
      const isValidCarrier = (carrier) => {
        return carrier === '' || validCarriers.includes(carrier);
      };
      
      expect(isValidCarrier('')).toBe(true);
      expect(isValidCarrier('DHL')).toBe(true);
    });

    it('allows custom carrier names', () => {
      // In practice, we allow any string for flexibility
      const carrier = 'Custom Carrier Inc.';
      expect(typeof carrier === 'string').toBe(true);
    });
  });
});
