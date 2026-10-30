import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  dashboardScreenContext, orderListScreenContext, inventoryCatalogScreenContext, adminMaterialsScreenContext,
  orderEditorProfilesContext, type MaterialEditorFields
} from '../../src/lib/assistant/visible-context';
import { safeScreenData } from '../../src/lib/assistant/screen-context';

const form: MaterialEditorFields = {
  category: 'LED_STRIP', code: 'LED-24V', nameEn: 'Branded LED strip', nameRu: '', nameLv: '',
  thicknessOptions: '3, 4', hex: '#FFFFFF', brand: 'Example brand', colorCode: '', type: 'COB',
  transmittance: 'hidden-sheet-value', voltage: '24 V', wattage: '12 W/m', colorTemp: '3000 K',
  ledCount: '480/m', length: '5 m', ipRating: 'IP20', width: '8 mm', height: '', diameter: 'hidden-filament-value',
  weight: '1 kg', packSize: '1 roll', minOrder: '1'
};
const catalogRow = {
  id: 42, category: 'LED_STRIP', code: 'LED-24V', name_en: 'Branded LED strip',
  thickness_options: [], metadata: { brand: 'Example brand', voltage: '12 V', privateSupplierNotes: 'private supplier data',
    signed_url: 'https://private.example/file', nested: { password: 'private password' } }
};
const editorInput = () => ({
  loading: false, error: false, search: 'LED', category: 'LED_STRIP', canManage: true, rows: [catalogRow],
  editor: { mode: 'edit' as const, selected: catalogRow, saving: false, error: false, unsavedChanges: false,
    form: { ...form }, groups: { electronics: true, sheet: false, filament: false, hardware: false } }
});
const listInput = () => ({
  loading: false, refreshing: false, error: false, hasLoadedOnce: true,
  search: 'Letter', status: 'active', sortKey: 'due', sortAsc: true,
  page: 2, pageSize: 20, totalPages: 3, matchingOrders: 46,
  counts: { total: 65, active: 46, urgent: 2 },
  rows: [{ id: 'visible-page-2', reference: 'PO-2', title: 'Letter sign', client: 'Client', dueDate: '2026-11-02',
    loadingDate: '2026-11-01', badges: ['In production'], expanded: false,
    stages: [['PAINTING', 'QUEUED']] as [string, string][],
    order: { internalNotes: 'private order note', file_bytes: 'private file bytes' } }]
});

describe('visible assistant screen projections', () => {
  it('preserves saved editor material specifications through the bounded screen sanitizer', () => {
    const profiles = orderEditorProfilesContext([{ quantity: 2, configuration: {
      profileName: 'Illuminated letters', signType: 'EXTERIOR',
      CNC_FREZER: { back: 'Aluminium 1050', backThickness: '2', face: 'PLEXIGLAS 0F00', faceThickness: '3' },
      ASSEMBLING: { led: true, ledModule: 'Mean Well LED fixture', cables: false, cableType: 'Hidden cable choice' },
      privateApiKey: 'private credential', fileBytes: 'private file data'
    } }]);
    const context = safeScreenData({ screen: 'order-editor', profiles }) as { profiles: typeof profiles };
    assert.equal(context.profiles[0].quantity, 2);
    assert.equal(context.profiles[0].sections.CNC_FREZER?.back, 'Aluminium 1050');
    assert.equal(context.profiles[0].sections.CNC_FREZER?.backThickness, '2');
    assert.equal(context.profiles[0].sections.CNC_FREZER?.faceThickness, '3');
    assert.equal(context.profiles[0].sections.ASSEMBLING?.ledModule, 'Mean Well LED fixture');
    assert.doesNotMatch(JSON.stringify(context), /private credential|private file|Hidden cable/);
  });

  it('keeps unavailable dashboard totals distinct from confirmed zero and excludes hidden panels', () => {
    const input = { loading: false, ordersError: true, verifiedTotal: null, kpis: null,
      recentOrders: [{ id: 'stale', title: 'Hidden row' }], trends: null };
    const unavailable = dashboardScreenContext(input);
    assert.deepEqual(unavailable.displayedKpis, { total: null, active: null, today: null, completedToday: null });
    assert.equal(unavailable.unavailable.orders, true);
    assert.deepEqual(unavailable.recentOrders.rows, []);
    const verified = dashboardScreenContext({ ...input, ordersError: false, verifiedTotal: 0,
      recentOrders: [], kpis: { total: 0, active: 0, today: 0, completedToday: 0 } });
    assert.equal(verified.displayedKpis?.total, 0);
    assert.equal(verified.unavailable.kpiBreakdown, false);
    const loading = dashboardScreenContext({ ...input, loading: true, verifiedTotal: 50 });
    assert.equal(loading.displayedKpis, null);
    assert.equal(loading.unavailable.orders, false);
  });

  it('describes only the supplied current page and its expanded stages, without copying order records', () => {
    const input = listInput();
    const collapsed = orderListScreenContext(input);
    assert.deepEqual(collapsed.pagination, { page: 2, pageSize: 20, totalPages: 3, matchingOrders: 46 });
    assert.equal(collapsed.visibleOrders.totalVisible, 1);
    assert.equal(collapsed.visibleOrders.rows[0].id, 'visible-page-2');
    assert.equal('stages' in collapsed.visibleOrders.rows[0], false);
    assert.equal('drafts' in collapsed.counts!, false);
    assert.doesNotMatch(JSON.stringify(collapsed), /private order|private file|internalNotes|file_bytes/);
    input.rows[0].expanded = true;
    const expanded = orderListScreenContext(input);
    assert.deepEqual(expanded.visibleOrders.rows[0].stages, [{ station: 'PAINTING', state: 'QUEUED' }]);
    input.error = true;
    input.refreshing = true;
    const stale = orderListScreenContext(input);
    assert.equal(stale.showingPreviousResults, true);
    assert.equal(stale.dataVerified, false);
    assert.equal(stale.unavailable, true);
    const initialFailure = orderListScreenContext({ ...input, hasLoadedOnce: false, rows: [] });
    assert.equal(initialFailure.counts, null);
    assert.equal(initialFailure.pagination.matchingOrders, null);
  });

  it('sends current catalog filters and stock values, and does not invent zero stock after a load failure', () => {
    const input = { loading: false, error: false, search: 'Mean Well', category: 'PSU_MEANWELL',
      lowStockOnly: true, lowStockCount: 1, canManage: false,
      rows: [{ id: 'psu', sku: 'LRS-100-24', name_en: 'Mean Well LRS-100-24', category: 'PSU_MEANWELL',
        stock: 0, min_stock: 2, unit: 'pcs', private_vendor_cost: 99, metadata: { password: 'private password' } }] };
    const context = inventoryCatalogScreenContext(input);
    assert.deepEqual(context.filters, { search: 'Mean Well', category: 'PSU_MEANWELL', lowStockOnly: true });
    assert.equal(context.visibleMaterials.rows[0].stock, 0);
    assert.equal(context.visibleMaterials.rows[0].lowStock, true);
    assert.equal(context.canManage, false);
    assert.doesNotMatch(JSON.stringify(context), /private_vendor_cost|password/);
    const failed = inventoryCatalogScreenContext({ ...input, error: true });
    assert.equal(failed.lowStockCount, null);
    assert.deepEqual(failed.visibleMaterials.rows, []);
    const malformed = inventoryCatalogScreenContext({ ...input, rows: [{ stock: NaN, min_stock: 2 }] });
    assert.equal(malformed.visibleMaterials.rows[0].stock, null);
    assert.equal(malformed.visibleMaterials.rows[0].lowStock, null);
  });

  it('reads unsaved editor values at snapshot time and excludes inactive fields and private metadata', () => {
    const input = editorInput();
    const first = adminMaterialsScreenContext(input);
    assert.equal(first.editor?.fields.voltage, '24 V');
    assert.equal(first.editor?.persisted, true);
    assert.equal(first.editor?.unsavedChanges, false);
    input.editor.form.voltage = '48 V';
    input.editor.form.nameEn = 'Updated strip model';
    input.editor.unsavedChanges = true;
    const edited = adminMaterialsScreenContext(input);
    assert.equal(edited.editor?.fields.voltage, '48 V');
    assert.equal(edited.editor?.fields.nameEn, 'Updated strip model');
    assert.equal(edited.editor?.unsavedChanges, true);
    assert.equal(edited.editor?.selectedMaterial?.name, 'Branded LED strip');
    assert.doesNotMatch(JSON.stringify(edited), /private supplier|private password|private\.example|hidden-sheet|hidden-filament|12 V/);
    const closed = adminMaterialsScreenContext({ ...input, editor: null });
    assert.equal(closed.editor, null);
    const readOnly = adminMaterialsScreenContext({ ...input, canManage: false });
    assert.equal(readOnly.editor, null);
    const creating = adminMaterialsScreenContext({ ...input, editor: { ...input.editor, mode: 'create', selected: null } });
    assert.equal(creating.editor?.persisted, false);
    assert.equal(creating.editor?.selectedMaterial, null);
  });

  it('projects the selected material category’s visible specifications after a category switch', () => {
    const input = editorInput();
    input.editor.form.category = 'FDM_PLA';
    input.editor.form.diameter = '1.75 mm';
    input.editor.groups = { electronics: false, sheet: false, filament: true, hardware: false };
    const context = adminMaterialsScreenContext(input);
    assert.equal(context.editor?.fields.diameter, '1.75 mm');
    assert.equal(context.editor?.fields.weight, '1 kg');
    assert.equal('voltage' in context.editor!.fields, false);
    assert.equal('length' in context.editor!.fields, false);
    assert.equal('thicknessOptions' in context.editor!.fields, false);
  });

  it('bounds unusually large visible tables and drafts with explicit sample counts under the send budget', () => {
    const input = editorInput();
    const huge = 'Long material data '.repeat(1000);
    input.rows = Array.from({ length: 1000 }, (_, index) => ({ ...catalogRow, id: index, name_en: huge }));
    for (const key of Object.keys(input.editor.form) as (keyof MaterialEditorFields)[]) input.editor.form[key] = huge;
    const context = adminMaterialsScreenContext(input);
    assert.equal(context.visibleMaterials.totalVisible, 1000);
    assert.equal(context.visibleMaterials.truncated, true);
    assert.equal(context.visibleMaterials.includedRows, context.visibleMaterials.rows.length);
    assert.ok(context.visibleMaterials.includedRows > 0);
    assert.ok(JSON.stringify(context).length < 12000);
    const orders = orderListScreenContext({ ...listInput(), rows: Array.from({ length: 100 }, (_, index) => ({
      id: index, reference: huge, title: huge, client: huge, expanded: true,
      stages: Array.from({ length: 10 }, () => [huge, huge] as [string, string])
    })) });
    assert.equal(orders.visibleOrders.truncated, true);
    assert.equal(orders.visibleOrders.totalVisible, 100);
    assert.equal(orders.visibleOrders.rows[0].stages?.length, 6);
    assert.ok(JSON.stringify(orders).length < 9000);
  });
});
