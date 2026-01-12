import { describe, it, expect } from 'vitest';
import { createNewOrder } from './signage-store';

describe('Order Creation', () => {
  it('should create a new order with default values', () => {
    const newOrder = createNewOrder();
    expect(newOrder).toBeTruthy();
    expect(newOrder.id).toBeTruthy();
    expect(newOrder.title).toBe('New Order');
    expect(newOrder.isDraft).toBe(true);
  });
});
