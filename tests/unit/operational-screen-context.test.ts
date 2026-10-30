import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  inventoryDetailScreenContext, inventoryListScreenContext, calendarScreenContext, productionScreenContext,
  inventoryItemEditorFingerprint, inventoryItemEditorFields, inventoryDetailEditorFingerprint,
  createScreenReadScope, screenOwnerKey, OPERATIONAL_CONTEXT_BUDGET
} from '../../src/lib/assistant/operational-context';
import { loadMaterials, loadMaterialById, createMaterial, updateMaterial, removeMaterial, recordMovement,
  materials, movements } from '../../src/lib/inventory/store';
import type { Material } from '../../src/lib/inventory/types';
import type { CalendarOrder, CalendarDaySummary } from '../../src/lib/calendar/day-summary';
import type { PlanningItem, PlanningTotals, StationSummary } from '../../src/lib/order/production-planning';

const material = (): Material => ({ id: 'material-one', code: 'PSU-24V', sku: 'HDR-60-24', category: 'PSU',
  name_en: 'Mean Well HDR-60-24', unit: 'pcs', stock: 0, min_stock: 2, item_group: 'Power supplies', location: 'A1',
  created_at: '2026-01-01', updated_at: '2026-10-30', price: 0,
  metadata: { brand: 'Mean Well', model: 'HDR-60-24', voltage_v: 24, source_url: 'https://www.lemona.lv/product.html',
    verified_at: '2026-10-30', data_notes: 'Supplier quantity remains unverified.', privatePassword: 'private-secret' } });
const detailInput = () => ({ id: 'material-one', current: true, loading: false, error: false, material: material(),
  canManage: true, editing: true, draft: { ...material(), name_en: 'Unsaved supply name', sku: 'NEW-SKU', location: 'B2' },
  changed: true, saving: false, adjusting: false, actionError: false, quantity: 3, note: 'Counted on shelf',
  specifications: [{ label: 'Voltage', value: '24 V' }] });
const order = (id = 'order-one'): CalendarOrder => ({ id, poNumber: `PO-${id}`, title: 'Window sign', client: 'Customer',
  status: 'READY_TO_LOAD', priority: 'NORMAL', dueDate: '2026-11-01', loadingDate: '2026-11-01' });
const selectedDay = (): CalendarDaySummary => ({ date: '2026-11-01',
  loadingDay: { id: 'day-one', date: '2026-11-01', active: true, carrier: 'Carrier', note: 'Use rear gate', capacity: 4 },
  loadingOrders: [order()], dueOrders: [order()], events: [{ id: 'meeting-one', kind: 'meeting', date: '2026-11-01',
    createdAt: '', title: 'Handover', start: '09:00', location: 'Workshop', note: 'Bring drawing' }], badges: [] });
const calendarInput = () => ({ current: true, loading: false, errors: [] as string[], selectedDate: '2026-11-01',
  displayedMonth: '2026-11', filter: 'scheduled', selected: selectedDay(), visibleOrders: [order()], matchingOrders: 1,
  canManage: true, modal: 'loading' as 'loading' | 'assign' | null, carrier: 'Unsaved carrier', note: 'Unsaved gate note',
  saving: false, actionError: false, pendingOrderId: null as string | null, eligibleOrders: [order('eligible')] });
const planning = (): PlanningItem => ({ id: 'order-one', station: 'CNC', poNumber: 'PO-1', client: 'Customer', title: 'Sign',
  status: 'IN_PRODUCTION', stageState: 'BLOCKED', priority: 'HIGH', dueDate: '2026-11-01', risk: 'blocked',
  paused: false, upcoming: false, estimatedHours: null, actualHours: null, blockedReason: 'Waiting for sheet' });
const productionInput = () => ({ current: true, loading: false, refreshing: false, error: false, loaded: true, isManager: true,
  hideEmpty: true, showUpcoming: false, attentionOnly: true, oversightKind: 'ALL', expandedOversight: false,
  totals: { orders: 1, activeAssignments: 1, overdue: 0, knownHours: 0, missingEstimates: 1 } as PlanningTotals,
  activeStations: 1, stations: ['CNC'], summaries: { CNC: { active: 1, queued: 0, inProgress: 0, blocked: 1, rework: 0,
    upcoming: 0, knownHours: 0, pressure: 'blocked' } as StationSummary }, orders: { CNC: [planning()] },
  alerts: Array.from({ length: 12 }, (_, index) => ({ ...planning(), id: String(index), poNumber: `ALERT-${index}` })),
  oversight: { asOf: '', unchangedCount: 1, skippedCount: 0, total: 1, previewLimit: 50, truncated: false, signals: [] },
  visibleOversight: [{ key: 'signal-one', kind: 'STAGE_UNCHANGED' as const, orderId: 'order-one', poNumber: 'PO-1',
    title: 'Sign', station: 'CNC', status: 'IN_PRODUCTION', stageState: 'QUEUED', recordedAt: '', elapsedHours: 80, reason: 'Check stage' }],
  scannerOpen: false });

describe('operational assistant snapshots', () => {
  it('includes the exact detail edit and visible catalog facts, while failed or changed scopes are unknown', () => {
    const input = detailInput(), context = inventoryDetailScreenContext(input);
    assert.deepEqual(context.editor?.fields, { name: 'Unsaved supply name', sku: 'NEW-SKU', group: 'Power supplies', location: 'B2' });
    assert.equal(context.unsaved, true);
    assert.equal(context.material?.stock, 0);
    assert.equal(context.material?.price, null);
    assert.equal(context.catalog?.model, 'HDR-60-24');
    assert.equal(context.catalog?.verifiedAt, '2026-10-30');
    assert.match(context.catalog?.dataNotes ?? '', /quantity remains unverified/);
    assert.equal(context.specifications.rows[0].value, '24 V');
    assert.equal(context.stockAdjustment?.applied, false);
    assert.doesNotMatch(JSON.stringify(context), /private-secret|privatePassword/);
    for (const state of [{ current: false }, { loading: true }, { error: true }, { id: 'another-material' }]) {
      const unavailable = inventoryDetailScreenContext({ ...input, ...state });
      assert.equal(unavailable.material, null); assert.equal(unavailable.editor, null);
      assert.equal(unavailable.catalog, null); assert.equal(unavailable.unsaved, false);
    }
    const closed = inventoryDetailScreenContext({ ...input, editing: false });
    assert.equal(closed.editor, null); assert.equal(closed.unsaved, false);
    assert.notEqual(inventoryDetailEditorFingerprint(input.draft), inventoryDetailEditorFingerprint(input.material));
  });

  it('retains the isolated item draft, correct current-section rows and honest list counts', () => {
    const initial = { section: 'electronics' as const }, changed = { ...initial, name_en: 'New cable', sku: 'CABLE-1' };
    assert.equal(inventoryItemEditorFingerprint(initial), inventoryItemEditorFingerprint({ ...initial, hex_color: '#000000', name_en: '' }));
    assert.notEqual(inventoryItemEditorFingerprint(initial), inventoryItemEditorFingerprint(changed));
    const input = { current: true, loading: false, error: false, section: 'electronics', search: 'Mean Well', rows: [material()],
      matchingAllSections: 15, lowStock: [material()], canManage: true, importOpen: false, scannerOpen: false,
      editor: { mode: 'create' as const, id: null, fields: inventoryItemEditorFields(changed), unsavedChanges: true, saving: false, error: false } };
    const context = inventoryListScreenContext(input);
    assert.equal(context.visibleMaterials.totalVisible, 1);
    assert.equal(context.matchingAllSections, 15);
    assert.equal(context.editor?.fields.name, 'New cable');
    assert.equal(context.unsaved, true);
    const loading = inventoryListScreenContext({ ...input, loading: true });
    assert.equal(loading.visibleMaterials.totalVisible, null);
    assert.equal(loading.matchingAllSections, null);
    const readOnly = inventoryListScreenContext({ ...input, canManage: false });
    assert.equal(readOnly.editor, null); assert.equal(readOnly.unsaved, false);
  });

  it('keeps selected-day sources and open loading-day edits distinct from partial calendar data', () => {
    const input = calendarInput(), context = calendarScreenContext(input);
    assert.equal(context.selectedDay.loadingDay?.carrier, 'Carrier');
    assert.ok(context.editor?.kind === 'loading');
    assert.equal(context.editor.carrier, 'Unsaved carrier');
    assert.equal(context.selectedDay.events.rows[0].type, 'meeting');
    assert.equal(context.selectedDay.loadingOrders.rows[0].reference, 'PO-order-one');
    assert.equal(context.unsaved, true);
    const partial = calendarScreenContext({ ...input, errors: ['orders'] });
    assert.equal(partial.selectedDay.counts.loadingOrders, null);
    assert.equal(partial.selectedDay.counts.events, 1);
    assert.equal(partial.visibleOrders.totalVisible, null);
    assert.equal(partial.unavailable, true);
    const clear = calendarScreenContext({ ...input, selected: { ...selectedDay(), events: [], loadingOrders: [], dueOrders: [] } });
    assert.deepEqual(clear.selectedDay.counts, { loadingOrders: 0, dueOrders: 0, events: 0 });
    const stale = calendarScreenContext({ ...input, current: false });
    assert.equal(stale.editor, null); assert.equal(stale.selectedDay.counts.events, null);
  });

  it('uses displayed production filters/cards and only the eight visible alerts, retaining manager gates', () => {
    const input = productionInput(), context = productionScreenContext(input);
    assert.equal(context.visibleOrders.rows[0].blockedReason, 'Waiting for sheet');
    assert.equal(context.visibleOrders.rows[0].estimatedHours, null);
    assert.equal(context.visibleAlerts.totalVisible, 8);
    assert.equal(context.oversight?.visibleSignals.rows[0].elapsedHours, 80);
    const readOnly = productionScreenContext({ ...input, isManager: false });
    assert.equal(readOnly.oversight, null);
    assert.equal('oversightKind' in readOnly.filters, false);
    const failed = productionScreenContext({ ...input, current: false, loaded: false, error: true });
    assert.equal(failed.displayedTotals, null);
    assert.equal(failed.visibleOrders.totalVisible, null);
    const stale = productionScreenContext({ ...input, error: true, refreshing: true });
    assert.equal(stale.showingPreviousResults, true);
    assert.equal(stale.displayedTotals?.overdue, 0);
  });

  it('caps large escaped payloads and discloses pruning without mutating current editor state', () => {
    const huge = '\u0000'.repeat(3000), source = detailInput();
    source.material.note = huge; source.material.name_en = huge; source.material.supplier = huge;
    source.material.metadata!.data_notes = huge; source.note = huge;
    source.draft.name_en = huge; source.draft.location = huge;
    const detail = inventoryDetailScreenContext(source);
    const snapshots = [detail,
      calendarScreenContext({ ...calendarInput(), note: huge, carrier: huge,
        visibleOrders: Array.from({ length: 100 }, () => ({ ...order(), title: huge, client: huge })),
        eligibleOrders: Array.from({ length: 100 }, () => ({ ...order(), title: huge, client: huge })) }),
      productionScreenContext({ ...productionInput(), orders: { CNC: Array.from({ length: 100 }, () => ({ ...planning(), title: huge, blockedReason: huge })) } })];
    for (const context of snapshots) assert.ok(JSON.stringify(context).length <= OPERATIONAL_CONTEXT_BUDGET);
    assert.equal(detail.unsaved, true);
    assert.equal(source.draft.name_en, huge);
    assert.equal(source.note, huge);
  });
});

describe('operational request ownership', () => {
  it('rejects old requests immediately after a record/account change and cancels their lifetime', () => {
    const scope = createScreenReadScope(), owner = screenOwnerKey({ id: 'one', role: 'Operator', stations: [{ stationId: 'CNC' }] });
    const first = scope.begin(`${owner}:material-one`);
    assert.equal(first.accepts(`${owner}:material-one`), true);
    assert.equal(first.accepts(`${owner}:material-two`), false);
    assert.equal(first.accepts(`${screenOwnerKey({ id: 'two', role: 'Operator' })}:material-one`), false);
    const second = scope.begin(`${owner}:material-two`);
    assert.equal(first.signal.aborted, true);
    assert.equal(first.accepts(`${owner}:material-one`), false);
    scope.cancel(); assert.equal(second.signal.aborted, true);
  });

  it('does not publish a delayed material reply after its caller changes owner, even if fetch ignores abort', async () => {
    const previousFetch = globalThis.fetch, previousWindow = (globalThis as any).window;
    let finish!: (response: Response) => void, owner = 'account-one';
    (globalThis as any).window = {}; materials.set([]);
    globalThis.fetch = async () => new Promise<Response>(resolve => finish = resolve);
    try {
      const request = loadMaterialById('old-material', { accept: () => owner === 'account-one' });
      owner = 'account-two';
      finish(Response.json({ id: 'old-material', name: 'Old private result', stock: 2, unit: 'pcs' }));
      assert.equal(await request, null);
      assert.deepEqual(get(materials), []);
    } finally { globalThis.fetch = previousFetch; (globalThis as any).window = previousWindow; materials.set([]); }
  });

  it('lets only the newest catalog request publish shared rows', async () => {
    const previousFetch = globalThis.fetch, previousWindow = (globalThis as any).window;
    const replies: Array<(response: Response) => void> = [];
    (globalThis as any).window = {}; materials.set([]);
    globalThis.fetch = async () => new Promise<Response>(resolve => replies.push(resolve));
    try {
      const old = loadMaterials(), current = loadMaterials();
      replies[1](Response.json({ data: [{ id: 'current', name: 'Current material', stock: 0, unit: 'pcs' }], pagination: { hasNext: false } }));
      await current;
      replies[0](Response.json({ data: [{ id: 'old', name: 'Old result', stock: 99, unit: 'pcs' }], pagination: { hasNext: false } }));
      await old;
      assert.deepEqual(get(materials).map(row => row.id), ['current']);
    } finally { globalThis.fetch = previousFetch; (globalThis as any).window = previousWindow; materials.set([]); }
  });

  it('replaces same-record account data with the authoritative response, including absent and null fields', async () => {
    const previousFetch = globalThis.fetch;
    try {
      for (const omitted of [true, false]) {
        materials.set([{ ...material(), note: 'Prior account private note', supplier: 'Prior supplier',
          vendor: 'Prior vendor', location: 'Private shelf', thickness_mm: 12 }]);
        globalThis.fetch = async () => Response.json({ id: 'material-one', name: 'Current account material',
          stock: 3, unit: 'pcs', ...(omitted ? {} : { metadata: null, note: null, supplier: null,
            vendor: null, location: null, thicknessMM: null }) });
        const current = await loadMaterialById('material-one', { accept: () => true });
        assert.ok(current);
        assert.equal(current.name_en, 'Current account material');
        assert.deepEqual(current.metadata, {});
        assert.equal(current.note, ''); assert.equal(current.supplier, ''); assert.equal(current.vendor, '');
        assert.equal(current.location, ''); assert.equal(current.thickness_mm, undefined);
        assert.equal(get(materials).length, 1);
        assert.equal(get(materials)[0], current);
        assert.doesNotMatch(JSON.stringify(get(materials)), /Prior|Private|HDR-60-24|quantity remains/);
      }
    } finally { globalThis.fetch = previousFetch; materials.set([]); }
  });

  it('returns successful late save/create/delete results without publishing into a new screen cache', async () => {
    const previousFetch = globalThis.fetch;
    let finish!: (response: Response) => void, owner = 'old';
    globalThis.fetch = async () => new Promise<Response>(resolve => finish = resolve);
    try {
      materials.set([material()]);
      const updated = updateMaterial('material-one', { name_en: 'Old submitted name' }, { accept: () => owner === 'old' });
      owner = 'current';
      const current = { ...material(), name_en: 'New account current name', stock: 7, metadata: {} };
      materials.set([current]);
      finish(Response.json({ id: 'material-one', name: 'Old submitted name', stock: 2, unit: 'pcs' }));
      assert.equal((await updated)?.name_en, 'Old submitted name');
      assert.deepEqual(get(materials), [current]);

      const created = createMaterial({ name_en: 'Old new item' }, { accept: () => false });
      finish(Response.json({ id: 'new-old-item', name: 'Old new item', stock: 0, unit: 'pcs' }));
      assert.equal((await created)?.id, 'new-old-item');
      assert.deepEqual(get(materials), [current]);

      const removed = removeMaterial('material-one', { accept: () => false });
      finish(new Response(null, { status: 204 }));
      assert.equal(await removed, true);
      assert.deepEqual(get(materials), [current]);
    } finally { globalThis.fetch = previousFetch; materials.set([]); }
  });

  it('retains a late committed movement receipt and releases its idempotency key without stale stock publication', async () => {
    const previousFetch = globalThis.fetch;
    let finish!: (response: Response) => void, owner = 'old';
    const requests: Array<{ requestId: string; qty: number }> = [];
    globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Promise<Response>(resolve => finish = resolve);
    };
    try {
      materials.set([material()]); movements.set([]);
      const late = recordMovement('material-one', 'IN', 2, { accept: () => owner === 'old', note: 'Old count' });
      owner = 'current';
      const current = { ...material(), name_en: 'Current account material', stock: 7, metadata: {} };
      materials.set([current]);
      finish(Response.json({ id: 'receipt-old', newStock: 2, unit: 'pcs', by: 'operator', at: '2026-10-30' }));
      assert.equal((await late)?.id, 'receipt-old');
      assert.deepEqual(get(materials), [current]);
      assert.deepEqual(get(movements), []);

      const next = recordMovement('material-one', 'IN', 1, { accept: () => owner === 'current', note: 'Current count' });
      assert.equal(requests.length, 2);
      assert.notEqual(requests[0].requestId, requests[1].requestId);
      finish(Response.json({ id: 'receipt-current', newStock: 8, unit: 'pcs', by: 'operator', at: '2026-10-30' }));
      assert.equal((await next)?.id, 'receipt-current');
      assert.equal(get(materials)[0].stock, 8);
      assert.deepEqual(get(movements).map(row => row.id), ['receipt-current']);
    } finally { globalThis.fetch = previousFetch; materials.set([]); movements.set([]); }
  });
});
