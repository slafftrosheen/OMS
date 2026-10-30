import type { Material } from '$lib/inventory/types';
import type { CalendarDaySummary, CalendarOrder } from '$lib/calendar/day-summary';
import type { PlanningItem, PlanningTotals, StationSummary } from '$lib/order/production-planning';
import type { OversightSignal, ProductionOversight } from '$lib/order/production-oversight';
import { projectCatalogEvidence } from '$lib/materials/catalog-evidence';
import { getLemonaSourceUrl } from '$lib/materials/catalog-metadata';
import { getMaterialSpecificationFacts } from '$lib/materials/catalog-presentation';

/** Leave room below the API's 14KB screen limit for envelope fields. */
export const OPERATIONAL_CONTEXT_BUDGET = 11500;
const text = (value: unknown, limit = 160): string | null => typeof value === 'string'
  ? value.length > limit ? `${value.slice(0, limit - 1)}…` : value
  : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Prune disclosed samples before shortening current selections. The source draft is never mutated. */
export function fitScreenContextBudget<T extends Record<string, unknown>>(value: T, budget = OPERATIONAL_CONTEXT_BUDGET): T & { contextTruncated?: boolean } {
  const context = JSON.parse(JSON.stringify(value));
  const size = () => JSON.stringify(context).length;
  if (size() <= budget) return context;
  context.contextTruncated = true;
  const samples: { value: { rows: unknown[]; includedRows: number; truncated: boolean }; priority: number }[] = [];
  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && Array.isArray((node as any).rows) && typeof (node as any).includedRows === 'number') {
      samples.push({ value: node as any, priority: path.startsWith('editor') ? 2 : path.startsWith('selectedDay') ? 1 : 0 });
    }
    for (const [key, child] of Object.entries(node)) visit(child, path ? `${path}.${key}` : key);
  };
  visit(context, '');
  for (const sample of samples.sort((a, b) => a.priority - b.priority)) {
    while (sample.value.rows.length && size() > budget) {
      sample.value.rows.pop(); sample.value.includedRows = sample.value.rows.length; sample.value.truncated = true;
    }
  }
  // Escaped control characters can cost more JSON space than their text length.
  for (const limit of [160, 80, 40, 20, 10]) {
    if (size() <= budget) break;
    const shorten = (node: Record<string, unknown> | unknown[]) => {
      for (const [key, child] of Object.entries(node)) {
        if (typeof child === 'string' && child.length > limit) (node as any)[key] = text(child, limit);
        else if (child && typeof child === 'object') shorten(child as Record<string, unknown>);
      }
    };
    shorten(context);
  }
  return context;
}

export function screenOwnerKey(user: { id?: string; role?: string; stations?: readonly { stationId: string }[] } | null | undefined) {
  return user?.id ? JSON.stringify([user.id, user.role ?? '', (user.stations ?? []).map(row => row.stationId).sort()]) : '';
}

/** A late response must pass both its request lifetime and the current screen owner. */
export function createScreenReadScope() {
  let current: AbortController | null = null;
  return {
    begin(owner: string) {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return { signal: controller.signal, accepts: (currentOwner: string) =>
        current === controller && !controller.signal.aborted && owner === currentOwner };
    },
    cancel() { current?.abort(); current = null; }
  };
}

function sample<T, R>(rows: readonly T[], project: (row: T) => R, budget: number, limit = 15, known = true) {
  const items: R[] = [];
  let used = 2;
  if (known) for (const row of rows.slice(0, limit)) {
    const item = project(row), size = JSON.stringify(item).length + 1;
    if (used + size > budget) break;
    items.push(item); used += size;
  }
  return { rows: items, totalVisible: known ? rows.length : null, includedRows: items.length,
    truncated: known && items.length < rows.length };
}

function stockMaterial(row: Partial<Material>) {
  return { id: text(row.id, 96), sku: text(row.sku, 96), name: text(row.name_en || row.code),
    section: text(row.section, 40), group: text(row.item_group, 80), subgroup: text(row.subgroup, 80),
    unit: text(row.unit, 24), stock: number(row.stock), minimum: number(row.min_stock), location: text(row.location, 120) };
}

/** Only fields rendered by ItemModal participate in its current draft and dirty state. */
export function inventoryItemEditorFields(data: Partial<Material>) {
  return { section: text(data.section || 'materials', 40), group: text(data.item_group, 80),
    subgroup: text(data.subgroup, 80), sku: text(data.sku, 96), name: text(data.name_en),
    unit: text(data.unit, 24), minimum: number(data.min_stock), location: text(data.location, 120),
    colorCode: text(data.color_code, 80), hexColor: text(data.hex_color, 24), supplier: text(data.supplier, 120),
    price: number(data.price), barcode: text(data.barcode, 96) };
}
export function inventoryItemEditorFingerprint(data: Partial<Material>) {
  return JSON.stringify([data.section || 'materials', data.item_group ?? '', data.subgroup ?? '', data.sku ?? '',
    data.name_en ?? '', data.unit ?? '', data.min_stock ?? null, data.location ?? '', data.color_code ?? '',
    data.hex_color || '#000000', data.supplier ?? '', data.price ?? null, data.barcode ?? '']);
}
export type InventoryEditorSnapshot = {
  mode: 'create' | 'edit'; id: string | null; fields: ReturnType<typeof inventoryItemEditorFields>;
  unsavedChanges: boolean; saving: boolean; error: boolean;
};

export function inventoryListScreenContext(input: {
  current: boolean; loading: boolean; error: boolean; section: string; search: string;
  rows: readonly Material[]; matchingAllSections: number; lowStock: readonly Material[];
  canManage: boolean; editor: InventoryEditorSnapshot | null; importOpen: boolean; scannerOpen: boolean;
}) {
  const ready = input.current && !input.loading && !input.error;
  const editor = input.current && input.canManage ? input.editor : null;
  return fitScreenContextBudget({ screen: 'inventory-list', loading: input.loading, unavailable: input.error || (!input.current && !input.loading),
    section: text(input.section, 40), search: text(input.search, 240), canManage: input.canManage,
    matchingAllSections: ready ? input.matchingAllSections : null,
    editor, unsaved: editor?.unsavedChanges ?? false,
    importOpen: input.canManage && input.importOpen, scannerOpen: input.scannerOpen, fileContentsProvided: false,
    visibleMaterials: sample(input.rows, stockMaterial, 5300, 15, ready),
    lowStock: sample(input.lowStock, row => ({ sku: text(row.sku, 96), stock: number(row.stock),
      minimum: number(row.min_stock), unit: text(row.unit, 24) }), 1800, 10, ready) });
}

export function inventoryDetailEditorFields(data: Partial<Material>) {
  return { name: text(data.name_en), sku: text(data.sku, 96), group: text(data.item_group, 80), location: text(data.location, 120) };
}
export function inventoryDetailEditorFingerprint(data: Partial<Material>) {
  return JSON.stringify([data.name_en ?? '', data.sku ?? '', data.item_group ?? '', data.location ?? '']);
}

export function inventoryDetailScreenContext(input: {
  id: string; current: boolean; loading: boolean; error: boolean; material: Material | undefined;
  canManage: boolean; editing: boolean; draft: Partial<Material>; changed: boolean;
  saving: boolean; adjusting: boolean; actionError: boolean; quantity: number; note: string;
  specifications?: readonly { label: string; value: string }[];
}) {
  const ready = input.current && !input.loading && !input.error && input.material?.id === input.id;
  const material = ready ? input.material! : null;
  const evidence = material ? projectCatalogEvidence(material).specifications : {};
  const source = getLemonaSourceUrl(evidence.source_url);
  const catalogVisible = !!evidence.brand || !!source || !!evidence.manufacturer_source_url ||
    (material && getMaterialSpecificationFacts(material).some(fact => fact.key !== 'unit'));
  const rawDate = evidence.verified_at;
  const checkedDate = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    && Number.isFinite(Date.parse(`${rawDate}T00:00:00Z`))
    && new Date(`${rawDate}T00:00:00Z`).toISOString().slice(0, 10) === rawDate ? rawDate : null;
  return fitScreenContextBudget({ screen: 'inventory-detail', materialId: text(input.id, 96), loading: input.loading,
    unavailable: input.error || (!input.loading && !material), canManage: input.canManage,
    material: material ? { ...stockMaterial(material), code: text(material.code, 96), category: text(material.category, 80),
      updatedAt: text(material.updated_at, 40), colorCode: text(material.color_code, 80), hexColor: text(material.hex_color, 24),
      note: text(material.note, 600), supplier: text(material.supplier, 120),
      price: typeof material.price === 'number' && material.price > 0 ? number(material.price) : null,
      barcode: text(material.barcode, 96), thicknessMm: number(material.thickness_mm) } : null,
    specifications: sample(input.specifications ?? [], row => ({ label: text(row.label, 80), value: text(row.value, 160) }), 2500, 12, !!material),
    catalog: material && catalogVisible ? { brand: text(evidence.brand), model: text(evidence.model),
      sourceUrl: text(source, 400), manufacturerSourceUrl: text(evidence.manufacturer_source_url, 400),
      verifiedAt: checkedDate, dataNotes: text(evidence.data_notes, 600) } : null,
    editor: material && input.editing && input.canManage ? { fields: inventoryDetailEditorFields(input.draft),
      unsavedChanges: input.changed, saving: input.saving, error: input.actionError } : null,
    unsaved: !!material && input.editing && input.canManage && input.changed,
    stockAdjustment: material && input.canManage ? { quantity: number(input.quantity), note: text(input.note, 600),
      pending: input.adjusting, applied: false, error: input.actionError } : null });
}

function planningItem(row: PlanningItem) {
  return { id: text(row.id, 96), station: text(row.station, 40), reference: text(row.poNumber, 96),
    title: text(row.title), client: text(row.client, 120), priority: text(row.priority, 24), stage: text(row.stageState, 40),
    dueDate: text(row.dueDate, 40), risk: text(row.risk, 24), paused: row.paused, upcoming: row.upcoming,
    estimatedHours: number(row.estimatedHours), blockedReason: text(row.blockedReason, 240) };
}

export function productionScreenContext(input: {
  current: boolean; loading: boolean; refreshing: boolean; error: boolean; loaded: boolean; isManager: boolean;
  hideEmpty: boolean; showUpcoming: boolean; attentionOnly: boolean; oversightKind: string; expandedOversight: boolean;
  totals: PlanningTotals | null; activeStations: number; stations: readonly string[];
  summaries: Record<string, StationSummary>; orders: Record<string, PlanningItem[]>; alerts: readonly PlanningItem[];
  oversight: ProductionOversight | null; visibleOversight: readonly OversightSignal[]; scannerOpen: boolean;
}) {
  const ready = input.current && input.loaded;
  const visibleCards = ready ? input.stations.flatMap(station => input.orders[station] ?? []) : [];
  return fitScreenContextBudget({ screen: 'production', loading: input.loading, refreshing: input.refreshing,
    unavailable: input.error || (!input.current && !input.loading), showingPreviousResults: ready && (input.error || input.refreshing),
    filters: { hideEmpty: input.hideEmpty, showUpcoming: input.showUpcoming, attentionOnly: input.attentionOnly,
      ...(input.isManager ? { oversightKind: text(input.oversightKind, 40), expandedOversight: input.expandedOversight } : {}) },
    scannerOpen: input.scannerOpen,
    displayedTotals: ready && input.totals ? { orders: number(input.totals.orders), assignments: number(input.totals.activeAssignments),
      activeStations: number(input.activeStations), overdue: number(input.totals.overdue), knownHours: number(input.totals.knownHours),
      missingEstimates: number(input.totals.missingEstimates) } : null,
    visibleStations: sample(input.stations, station => {
      const summary = input.summaries[station];
      return { station: text(station, 40), active: number(summary?.active), queued: number(summary?.queued),
        inProgress: number(summary?.inProgress), blocked: summary ? number(summary.blocked + summary.rework) : null,
        upcoming: number(summary?.upcoming), knownHours: number(summary?.knownHours), pressure: text(summary?.pressure, 24),
        matchingCards: input.orders[station]?.length ?? null };
    }, 2200, 15, ready),
    visibleOrders: sample(visibleCards, planningItem, 3800, 15, ready),
    visibleAlerts: sample(input.alerts.slice(0, 8), row => ({ reference: text(row.poNumber || row.title, 120),
      station: text(row.station, 40), risk: text(row.risk, 24) }), 1200, 8, ready),
    oversight: input.isManager && ready && input.oversight ? {
      unchangedCount: number(input.oversight.unchangedCount), skippedCount: number(input.oversight.skippedCount),
      availableSignals: number(input.oversight.total), serverTruncated: input.oversight.truncated,
      visibleSignals: sample(input.visibleOversight, row => ({ reference: text(row.poNumber || row.title || row.orderId, 120),
        station: text(row.station, 40), kind: text(row.kind, 40), elapsedHours: number(row.elapsedHours),
        reason: text(row.reason, 240) }), 2300, 10)
    } : null });
}

function calendarOrder(row: CalendarOrder) {
  return { id: text(row.id, 96), reference: text(row.poNumber, 96), title: text(row.title), client: text(row.client, 120),
    status: text(row.status, 40), dueDate: text(row.dueDate, 40), loadingDate: text(row.loadingDate, 40) };
}

export function calendarScreenContext(input: {
  current: boolean; loading: boolean; errors: readonly string[]; selectedDate: string; displayedMonth: string;
  filter: string; selected: CalendarDaySummary; visibleOrders: readonly CalendarOrder[]; matchingOrders: number;
  canManage: boolean; modal: 'assign' | 'loading' | null; carrier: string; note: string;
  saving: boolean; actionError: boolean; pendingOrderId: string | null; eligibleOrders: readonly CalendarOrder[];
}) {
  const known = (source: string) => input.current && !input.loading && !input.errors.includes(source);
  const orderKnown = known('orders'), daysKnown = known('loading_days'), eventsKnown = known('events');
  const selected = input.selected;
  const editorStatus = { date: text(input.selectedDate, 40), saving: input.saving, error: input.actionError };
  const editor = input.current && input.canManage && input.modal ? input.modal === 'loading'
    ? { ...editorStatus, kind: 'loading' as const, carrier: text(input.carrier, 120), note: text(input.note, 600),
      unsavedChanges: !!(input.carrier || input.note) }
    : { ...editorStatus, kind: 'assign' as const, pendingOrderId: text(input.pendingOrderId, 96),
      eligibleOrders: sample(input.eligibleOrders, calendarOrder, 1600, 6, orderKnown) }
    : null;
  return fitScreenContextBudget({ screen: 'calendar', selectedDate: text(input.selectedDate, 40), displayedMonth: text(input.displayedMonth, 20),
    filter: text(input.filter, 40), loading: input.loading, unavailable: input.errors.length > 0 || (!input.current && !input.loading),
    unavailableSources: input.errors.filter(source => ['orders', 'loading_days', 'events'].includes(source)),
    selectedDay: {
      counts: { loadingOrders: orderKnown ? selected.loadingOrders.length : null,
        dueOrders: orderKnown ? selected.dueOrders.length : null, events: eventsKnown ? selected.events.length : null },
      loadingDayKnown: daysKnown,
      loadingDay: daysKnown && selected.loadingDay ? { active: selected.loadingDay.active, carrier: text(selected.loadingDay.carrier, 120),
        note: text(selected.loadingDay.note, 600), capacity: number(selected.loadingDay.capacity) } : null,
      loadingOrders: sample(selected.loadingOrders, calendarOrder, 1800, 6, orderKnown),
      dueOrders: sample(selected.dueOrders, calendarOrder, 1600, 5, orderKnown),
      events: sample(selected.events, row => ({ type: row.kind, note: text(row.note, 300),
        ...(row.kind === 'loading' ? { carrier: text(row.carrier, 120), references: row.poList.slice(0, 8).map(value => text(value, 96)),
          start: text(row.window?.start, 20), end: text(row.window?.end, 20) } : { title: text(row.title),
          ...(row.kind === 'meeting' ? { start: text(row.start, 20), end: text(row.end, 20), location: text(row.location, 120) } : {}) })
      }), 1500, 6, eventsKnown)
    }, editor, unsaved: editor?.kind === 'loading' && editor.unsavedChanges === true,
    visibleOrders: sample(input.visibleOrders, calendarOrder, 1800, 6, orderKnown),
    matchingOrders: orderKnown ? input.matchingOrders : null });
}
