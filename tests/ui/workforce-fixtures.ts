import type { User } from '../../src/lib/auth/types';
import type { WorkEntry } from '../../src/lib/workforce/types';

export const workforceFixtureUsers: Record<'worker' | 'second' | 'manager', User> = {
  worker: { id: 'a1111111-1111-4111-8111-111111111111', username: 'elina', displayName: 'Elīna Ozola', role: 'Operator', stations: [{ stationId: 'assembly', isHead: false }] },
  second: { id: 'b2222222-2222-4222-8222-222222222222', username: 'janis', displayName: 'Jānis Bērziņš', role: 'Operator', stations: [{ stationId: 'cnc', isHead: false }] },
  manager: { id: 'c3333333-3333-4333-8333-333333333333', username: 'rd', displayName: 'R&D Root', role: 'RD', stations: [] }
};

export function workforceFixtureEntry(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: 'd4444444-4444-4444-8444-444444444444', userId: workforceFixtureUsers.worker.id,
    workDate: '2026-10-30', actualMinutes: 480, creditedMinutes: 480, multiplier: 1,
    holidayName: null, note: 'Assembly work', version: 1, createdAt: '2026-10-30T15:00:00Z', updatedAt: '2026-10-30T15:00:00Z',
    ...overrides
  };
}

export const workforceFixtureReportId = 'e5555555-5555-4555-8555-555555555555';
