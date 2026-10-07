import { describe, expect, it } from 'vitest';
import {
  buildCreateChangeRequestArgs,
  buildReviewChangeRequestArgs,
  normalizeChangeRequestRow
} from '$lib/server/change-requests/contract';

describe('change request database contract', () => {
  it('maps the UI create payload onto the live RPC argument names', () => {
    expect(buildCreateChangeRequestArgs('order-1', {
      description: 'Change width to 1200',
      changes: { title: 'Updated sign dimensions' }
    })).toEqual({
      p_order_id: 'order-1',
      p_description: 'Change width to 1200',
      p_proposed_diff: { title: 'Updated sign dimensions' }
    });
  });

  it('accepts persisted proposedDiff and rejects empty description or non-object diff', () => {
    expect(buildCreateChangeRequestArgs('order-2', {
      description: 'Clarify finish',
      proposed_diff: { title: 'Matte finish' }
    }).p_proposed_diff).toEqual({ title: 'Matte finish' });

    let missingDescription = false;
    try { buildCreateChangeRequestArgs('order-2', { changes: {} }); } catch (err) {
      missingDescription = err instanceof Error && err.message.includes('description');
    }
    expect(missingDescription).toBe(true);

    let invalidDiff = false;
    try { buildCreateChangeRequestArgs('order-2', { description: 'Bad diff', changes: 'string' }); } catch (err) {
      invalidDiff = err instanceof Error && err.message.includes('object');
    }
    expect(invalidDiff).toBe(true);
  });

  it('uses the actual review RPC parameter names', () => {
    expect(buildReviewChangeRequestArgs('cr-1', 'approved', 'Looks good')).toEqual({
      p_change_request_id: 'cr-1',
      p_decision: 'approved',
      p_notes: 'Looks good'
    });
  });

  it('normalizes the current DB row shape for the existing editor UI', () => {
    const normalized = normalizeChangeRequestRow({
      id: 'cr-1', description: 'Change dimensions', proposed_diff: { width: 1200 },
      status: 'pending', requested_by: 'user-1',
      requester: { username: 'operator1', display_name: 'Operator One' }
    });
    expect(normalized.title).toBe('Change dimensions');
    expect(normalized.changes).toEqual({ width: 1200 });
    expect(normalized.proposed_by_user.username).toBe('operator1');
  });
});
