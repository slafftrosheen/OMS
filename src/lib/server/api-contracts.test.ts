import { describe, expect, it } from 'vitest';
import { globalSearchArgs, advancedSearchArgs, orderSearchArgs, qrGenerationArgs, qrLabelFromOrder, isValidOrderId } from './api-contracts';

describe('live database API contracts', () => {
  it('maps simple global search to its deployed signature', () => {
    expect(globalSearchArgs('sign', 12)).toEqual({ p_query: 'sign', p_limit: 12 });
  });
  it('maps advanced filters only to deployed named arguments', () => {
    expect(advancedSearchArgs('sign', { status: ['PENDING_REVIEW'], priority: ['HIGH'], client: 'Acme' }, 15, 5)).toEqual({
      p_query: 'sign', p_status: ['PENDING_REVIEW'], p_priority: ['HIGH'], p_client: 'Acme', p_limit: 15, p_offset: 5
    });
  });
  it('maps search_orders to its sole named parameter', () => {
    expect(orderSearchArgs('sign')).toEqual({ search_query: 'sign' });
  });
  it('uses the live QR RPC label argument', () => {
    expect(qrGenerationArgs('order-id', 'PO-42')).toEqual({ p_order_id: 'order-id', p_label: 'PO-42' });
  });
  it('validates UUID order identifiers and derives a bounded QR label', () => {
    expect(isValidOrderId('not-a-uuid')).toBe(false);
    expect(isValidOrderId('00000000-0000-4000-8000-000000000000')).toBe(true);
    expect(qrLabelFromOrder('  PO-42  ')).toBe('PO-42');
    expect(qrLabelFromOrder(null)).toBe(null);
  });
});
