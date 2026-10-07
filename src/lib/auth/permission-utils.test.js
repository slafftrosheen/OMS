import { describe, it, expect } from 'vitest';
import { can } from './permission-utils.js';

const user = (role, stations = []) => ({
  id: `test-${role}`,
  username: role,
  displayName: role,
  role,
  stations
});

describe('permission-utils', () => {
  it('RD has every superuser feature', () => {
    const rd = user('RD');
    expect(can(rd, 'createDraftOrder')).toBe(true);
    expect(can(rd, 'deleteOrder')).toBe(true);
    expect(can(rd, 'manageUsers')).toBe(true);
    expect(can(rd, 'useAiLab')).toBe(true);
    expect(can(rd, 'createRDOrder')).toBe(true);
  });

  it('Boss has superuser access', () => {
    const boss = user('Boss');
    expect(can(boss, 'manageUsers')).toBe(true);
    expect(can(boss, 'assignPoNumber')).toBe(true);
    expect(can(boss, 'createRDOrder')).toBe(true);
  });

  it('Operator has read-only operational access', () => {
    const operator = user('Operator');
    expect(can(operator, 'viewOrders')).toBe(true);
    expect(can(operator, 'viewInventory')).toBe(true);
    expect(can(operator, 'editOrder')).toBe(false);
    expect(can(operator, 'useAiLab')).toBe(false);
  });

  it('StationHead can edit only their headed station', () => {
    const lead = user('StationHead', [{ stationId: 'cnc', isHead: true }]);
    expect(can(lead, 'editStationName')).toBe(true);
  });

  it('returns false for unauthenticated users and unknown features', () => {
    expect(can(null, 'createDraftOrder')).toBe(false);
    expect(can(user('RD'), 'unknownFeature')).toBe(false);
  });
});
