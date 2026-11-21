import { describe, it, expect } from 'vitest';
import { stockLevel, isShort } from '../../src/lib/inventory/stock-level';

describe('stockLevel', () => {
  it('never flags items without a minimum', () => {
    expect(stockLevel(0, 0)).toBe('untracked');
    expect(stockLevel(5, null)).toBe('untracked');
    expect(isShort(0, 0)).toBe(false);
  });
  it('flags out of stock and low stock only when a minimum is set', () => {
    expect(stockLevel(0, 10)).toBe('out');
    expect(stockLevel(4, 6)).toBe('low');
    expect(stockLevel(6, 6)).toBe('low');
    expect(stockLevel(7, 6)).toBe('ok');
    expect(isShort(4, 6)).toBe(true);
  });
});
