import { describe, it, expect } from 'vitest';
import { GET } from '../../src/routes/api/draft-orders/+server';
import { __setQueryMock } from '../../src/lib/server/db/connection';

describe('GET /api/draft-orders', () => {
  it('should return a list of draft orders', async () => {
    __setQueryMock(async () => ({
      rows: [
        {
          id: '1',
          po_number: 'PO-123',
          client: 'Test Client',
          title: 'Test Order',
          due_date: '2024-01-01',
          loading_date: '2024-01-10',
          status: 'draft',
          priority: 'NORMAL',
          delivery_address: '123 Test St',
          delivery_contact: 'John Doe',
          delivery_phone: '555-1234',
          profiles: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ],
    }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].poNumber).toBe('PO-123');
  });
});
