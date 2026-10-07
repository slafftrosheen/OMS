import { describe, expect, it } from 'vitest';
import { buildCreateChangeRequestArgs, buildReviewChangeRequestArgs, normalizeChangeRequestRow } from './contract';

describe('change request database contract', () => {
  it('maps a UI create payload to the live RPC named arguments', () => {
    expect(buildCreateChangeRequestArgs('order-1', {
      description: 'Change title',
      changes: { title: 'New title' }
    })).toEqual({
      p_order_id: 'order-1',
      p_description: 'Change title',
      p_proposed_diff: { title: 'New title' }
    });
  });

  it('rejects a missing description and unsupported diff fields', () => {
    let missingDescription = false;
    try { buildCreateChangeRequestArgs('order-1', { changes: {} }); }
    catch (err) { missingDescription = err instanceof Error && err.message.includes('description'); }
    expect(missingDescription).toBe(true);

    let unsupportedField = false;
    try { buildCreateChangeRequestArgs('order-1', { description: 'Change', changes: { finish: 'matte' } }); }
    catch (err) { unsupportedField = err instanceof Error && err.message.includes('finish'); }
    expect(unsupportedField).toBe(true);
  });

  it('uses the live review RPC parameter names', () => {
    expect(buildReviewChangeRequestArgs('cr-1', 'approved', 'Looks good')).toEqual({
      p_change_request_id: 'cr-1',
      p_decision: 'approved',
      p_notes: 'Looks good'
    });
  });

  it('normalizes live database rows for the existing editor UI', () => {
    const row = normalizeChangeRequestRow({
      id: 'cr-1', description: 'Change title', proposed_diff: { title: 'New' },
      requester: { username: 'operator' }
    });
    expect(row.title).toBe('Change title');
    expect(row.changes).toEqual({ title: 'New' });
    expect(row.proposed_by_user.username).toBe('operator');
  });
});
