// tests/lib/order/lifecycle.test.ts
//
// Unit tests for the new lifecycle helpers in $lib/auth/permission-utils.

import { describe, it, expect } from 'vitest';
import {
  can,
  canViewOrder,
  normaliseStatus,
  ORDER_STATUS_LABELS,
} from '../../../src/lib/auth/permission-utils';
import type { User } from '../../../src/lib/auth/types';

const baseUser: Omit<User, 'role'> = {
  id: 'u-1',
  username: 'tester',
  displayName: 'Tester',
  stations: [],
};

const userAs = (role: User['role']): User => ({ ...baseUser, role });

describe('normaliseStatus', () => {
  it('maps canonical states through unchanged', () => {
    for (const s of [
      'DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION',
      'READY_TO_LOAD', 'DISPATCHED', 'ARCHIVED', 'CANCELLED', 'ON_HOLD', 'VOIDED',
    ] as const) {
      expect(normaliseStatus(s)).toBe(s);
    }
  });

  it('maps legacy lowercase values onto the new states', () => {
    expect(normaliseStatus('draft')).toBe('DRAFT');
    expect(normaliseStatus('approved')).toBe('CONFIRMED');
    expect(normaliseStatus('rejected')).toBe('CANCELLED');
    expect(normaliseStatus('queued')).toBe('IN_PRODUCTION');
    expect(normaliseStatus('in_progress')).toBe('IN_PRODUCTION');
    expect(normaliseStatus('completed')).toBe('ARCHIVED');
  });

  it('falls back to DRAFT for null / unknown values', () => {
    expect(normaliseStatus(null)).toBe('DRAFT');
    expect(normaliseStatus(undefined)).toBe('DRAFT');
    expect(normaliseStatus('something_else')).toBe('DRAFT');
  });

  it('exposes a label for every canonical state', () => {
    expect(ORDER_STATUS_LABELS.DRAFT).toBe('Draft');
    expect(ORDER_STATUS_LABELS.PENDING_REVIEW).toBe('Pending Review');
    expect(ORDER_STATUS_LABELS.READY_TO_LOAD).toBe('Ready to Load');
    expect(ORDER_STATUS_LABELS.DISPATCHED).toBe('Dispatched');
  });
});

describe('canViewOrder', () => {
  it('hides pre-confirmation drafts from operators', () => {
    expect(canViewOrder(userAs('Operator'), 'PENDING_REVIEW', 'someone-else')).toBe(false);
    expect(canViewOrder(userAs('StationHead'), 'DRAFT', 'someone-else')).toBe(false);
  });

  it('shows pre-confirmation drafts to creator', () => {
    expect(canViewOrder(userAs('Operator'), 'PENDING_REVIEW', 'u-1')).toBe(true);
  });

  it('shows pre-confirmation drafts to RD / Boss / HoP', () => {
    for (const r of ['RD', 'Boss', 'HeadOfProduction'] as const) {
      expect(canViewOrder(userAs(r), 'PENDING_REVIEW', 'someone-else')).toBe(true);
    }
  });

  it('shows confirmed+ orders to everyone authenticated', () => {
    for (const r of ['RD', 'Boss', 'HeadOfProduction', 'StationHead', 'Operator'] as const) {
      expect(canViewOrder(userAs(r), 'CONFIRMED', 'someone-else')).toBe(true);
      expect(canViewOrder(userAs(r), 'IN_PRODUCTION', 'someone-else')).toBe(true);
      expect(canViewOrder(userAs(r), 'DISPATCHED', 'someone-else')).toBe(true);
    }
  });

  it('returns false for unauthenticated user', () => {
    expect(canViewOrder(null, 'CONFIRMED', 'anyone')).toBe(false);
  });

  it('respects legacy lowercase status values', () => {
    expect(canViewOrder(userAs('Operator'), 'draft', 'someone-else')).toBe(false);
    expect(canViewOrder(userAs('Operator'), 'approved', 'someone-else')).toBe(true);
  });
});

describe('can() — new permission flags', () => {
  it('assignPoNumber is Boss-only', () => {
    expect(can(userAs('Boss'), 'assignPoNumber')).toBe(true);
    expect(can(userAs('RD'), 'assignPoNumber')).toBe(false);
    expect(can(userAs('HeadOfProduction'), 'assignPoNumber')).toBe(false);
  });

  it('voidAndReissue is Boss-only', () => {
    expect(can(userAs('Boss'), 'voidAndReissue')).toBe(true);
    expect(can(userAs('RD'), 'voidAndReissue')).toBe(false);
  });

  it('reviewQueue / confirmOrder / assignLoadingDay / markDispatched are HoP+', () => {
    for (const flag of ['reviewQueue', 'confirmOrder', 'assignLoadingDay', 'markDispatched'] as const) {
      expect(can(userAs('HeadOfProduction'), flag)).toBe(true);
      expect(can(userAs('Boss'), flag)).toBe(true);
      expect(can(userAs('RD'), flag)).toBe(true);
      expect(can(userAs('StationHead'), flag)).toBe(false);
      expect(can(userAs('Operator'), flag)).toBe(false);
    }
  });

  it('viewPreConfirmedDrafts mirrors HoP+ rule', () => {
    expect(can(userAs('HeadOfProduction'), 'viewPreConfirmedDrafts')).toBe(true);
    expect(can(userAs('Operator'), 'viewPreConfirmedDrafts')).toBe(false);
  });

  it('null user fails every check', () => {
    for (const flag of ['assignPoNumber', 'reviewQueue', 'voidAndReissue', 'markDispatched']) {
      expect(can(null, flag)).toBe(false);
    }
  });
});
