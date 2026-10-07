import { describe, expect, it } from 'vitest';
import { canManageSharedInventory, validateLoadingDayInput, validateMaterialInput } from '../src/lib/server/authz/shared-data';

describe('shared inventory authorization and validation', () => {
  it('allows only elevated roles to mutate shared reference data', () => {
    expect(canManageSharedInventory('RD')).toBe(true);
    expect(canManageSharedInventory('Boss')).toBe(true);
    expect(canManageSharedInventory('HeadOfProduction')).toBe(true);
    expect(canManageSharedInventory('StationHead')).toBe(false);
    expect(canManageSharedInventory('Operator')).toBe(false);
    expect(canManageSharedInventory(null)).toBe(false);
  });
  it('strips protected fields and rejects invalid loading-day values', () => {
    const patch = validateLoadingDayInput({ notes: 'Carrier changed', created_at: 'forged' }, true);
    expect(Object.keys(patch)).toEqual(['notes']);
    let rejected = false;
    try { validateLoadingDayInput({ max_capacity: -1 }, true); } catch { rejected = true; }
    expect(rejected).toBe(true);
  });
  it('validates material input and rejects negative stock', () => {
    const row = validateMaterialInput({ category: 'sheet', code: 'PVC-3', name_en: 'PVC', stock: 4, rogue: true });
    expect(row.category).toBe('sheet');
    expect('rogue' in row).toBe(false);
    let rejected = false;
    try { validateMaterialInput({ category: 'sheet', code: 'PVC-4', name_en: 'PVC', stock: -1 }); } catch { rejected = true; }
    expect(rejected).toBe(true);
  });
});
