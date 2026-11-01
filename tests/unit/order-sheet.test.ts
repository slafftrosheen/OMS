import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  hasNativeProfileConfiguration, mayEditOrderSheet, orderSheetAccountKey, profileSheetKey,
  readOrderSheetSnapshot, savedProfileDetails
} from '../../src/lib/order/order-sheet';
import { canEditDraft } from '../../src/lib/server/order/draft-contract';

const native = {
  profileName: 'Yellow channel letter',
  CNC_FREZER: { faceMaterials: [{ id: 'face-one', value: 'PLEXIGLAS_GS_1C33', thickness: '3mm' }] },
  FRONT: { face: true, facePrint: true, faceCustom: 'Print on translucent film' },
  ASSEMBLING: { notes: 'Check mounting holes before installation.' }
};
const snapshot = {
  id: 'order-a', status: 'CONFIRMED', createdBy: 'creator', updatedAt: '2026-10-31T10:00:00Z',
  profiles: [{ id: 'profile-one', quantity: 2, configuration: native }]
};

describe('shared saved order sheet', () => {
  it('keeps the exact saved profile content and ordering without defaults or mutations', () => {
    const saved = { ...snapshot, profiles: [
      { id: 'second-created', configuration: native, quantity: 3 },
      { id: 'first-created', configuration: { legacyPart: 'Historic manual specification' }, quantity: 1 }
    ] };
    const before = JSON.stringify(saved);
    const parsed = readOrderSheetSnapshot(saved, 'order-a');
    expect(parsed).toBe(saved);
    expect(parsed?.profiles.map(profile => profile.id)).toEqual(['second-created', 'first-created']);
    expect(JSON.stringify(saved)).toBe(before);
    expect(readOrderSheetSnapshot({ ...snapshot, profiles: [] }, 'order-a')?.profiles).toEqual([]);
  });

  it('rejects wrong-order, denied and incomplete snapshots rather than rendering a blank native form', () => {
    for (const value of [null, undefined, [], { error: 'Forbidden' }, { ...snapshot, id: 'order-b' },
      { ...snapshot, status: null }, { ...snapshot, updatedAt: '' }, { ...snapshot, updatedAt: null },
      { ...snapshot, profiles: undefined }, { ...snapshot, profiles: {} },
      { ...snapshot, profiles: [null] }, { ...snapshot, profiles: [[]] }]) {
      expect(readOrderSheetSnapshot(value, 'order-a')).toBeNull();
    }
  });

  it('matches the existing server draft edit policy across roles, ownership and lifecycle states', () => {
    const statuses = ['DRAFT', 'draft', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_LOAD',
      'ON_HOLD', 'DISPATCHED', 'ARCHIVED', 'VOIDED', 'unknown', ''];
    for (const role of ['RD', 'Boss', 'HeadOfProduction', 'StationHead', 'Operator', 'Guest']) {
      for (const status of statuses) {
        for (const owner of ['creator', 'someone-else']) {
          expect(mayEditOrderSheet({ id: 'creator', role }, { status, createdBy: owner }))
            .toBe(canEditDraft(role, owner, 'creator', status));
        }
      }
    }
    expect(mayEditOrderSheet(null, { status: 'DRAFT', createdBy: 'creator' })).toBe(false);
    expect(mayEditOrderSheet({ role: 'RD' }, snapshot)).toBe(false);
    expect(mayEditOrderSheet({ id: 'creator', role: 'Operator' }, { status: 'DRAFT', created_by: 'creator' })).toBe(true);
  });

  it('invalidates saved access when identity, role or station assignments change', () => {
    const user = { id: 'worker', role: 'Operator', stations: [{ stationId: 'cnc', isHead: false }, { stationId: 'assembly', isHead: true }] };
    const key = orderSheetAccountKey(user);
    expect(orderSheetAccountKey({ ...user, stations: [...user.stations].reverse() })).toBe(key);
    expect(orderSheetAccountKey({ ...user, id: 'someone-else' })).not.toBe(key);
    expect(orderSheetAccountKey({ ...user, role: 'HeadOfProduction' })).not.toBe(key);
    expect(orderSheetAccountKey({ ...user, stations: [{ stationId: 'cnc', isHead: true }] })).not.toBe(key);
    expect(orderSheetAccountKey(null)).toBe('');
  });

  it('uses saved identity across profile reordering and retains legacy data as saved', () => {
    expect(profileSheetKey({ dbId: 'saved', id: 'other', clientKey: 'local' }, 0)).toBe('saved');
    expect(profileSheetKey({ id: 'saved' }, 0)).toBe(profileSheetKey({ id: 'saved' }, 7));
    expect(profileSheetKey({ clientKey: 'local' }, 0)).toBe('local');
    expect(profileSheetKey({}, 3)).toBe('saved-profile-3');
    expect(hasNativeProfileConfiguration(native)).toBe(true);
    for (const value of [null, [], {}, { profileName: 'Legacy', fabricationSpec: { width_mm: 500 } },
      { CNC_FREZER: null }, { CNC_FREZER: [] }]) expect(hasNativeProfileConfiguration(value)).toBe(false);
    expect(savedProfileDetails({ profileName: 'Legacy', signType: 'EXTERIOR', manual_note: 'Line 1\nLine 2',
      fabricationSpec: { width_mm: 500 } })).toEqual([
      ['manual note', 'Line 1\nLine 2'], ['fabricationSpec', '{"width_mm":500}']
    ]);
  });

  it('places the same native form before supporting tabs and keeps readonly presentation consistent', () => {
    const read = (path: string) => readFileSync(path, 'utf8');
    const detail = read('src/routes/orders/[id]/+page.svelte');
    const editor = read('src/routes/orders/[id]/edit/+page.svelte');
    const packet = read('src/lib/components/station/StationProductionPacket.svelte');
    const sheet = read('src/lib/order/OrderProfileSheet.svelte');
    expect(detail.indexOf('<OrderProfileSheet')).toBeLessThan(detail.indexOf('<Tabs'));
    expect(detail).not.toContain('activeTab === "overview"');
    expect(detail).toContain('readOrderSheetSnapshot(sheetData, requestedId)');
    expect(detail).toContain("sheetIssue === 'denied'");
    expect(detail).toContain('loadedAccountId === ownerKey');
    expect(detail).toContain('version === requestVersion');
    expect(editor).toContain('<OrderProfileSheet');
    expect(editor).toContain('focusedProfileIndex={activeNativeProfileIndex}');
    expect(editor).toContain('loadedOwnerKey === ownerKey');
    expect(editor).toContain('generation === requestGeneration');
    expect(editor).toContain('if (!scope.isCurrent()) return false;');
    expect(editor).toContain('const scope=captureOrderRequest(), editor=editorRef;');
    expect(packet).toContain('<OrderProfileSheet profiles={order.profiles} />');
    expect(packet).toContain('loadedAccount===ownerKey');
    expect(sheet).toContain('editable = false');
    expect(sheet).toContain('{#if focusedProfileIndex === index}');
    expect(sheet).toContain('profile_template_id: event.currentTarget.value || null');
    expect(sheet).toContain('hasNativeProfileConfiguration(profile.configuration)');
    expect(sheet).not.toContain('summarizeNativeProfileConfiguration');
  });
});
