import { summarizeNativeProfileConfiguration } from '$lib/order/native-profile-context';
import { safeScreenData } from './screen-context';
import { fitScreenContextBudget, OPERATIONAL_CONTEXT_BUDGET } from './operational-context';

/** Explicit projections of rendered state. Never send an API record or its metadata wholesale. */
const text = (value: unknown, limit = 160): string | null => typeof value === 'string'
  ? value.slice(0, limit) : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Keep section values within the shared sanitizer's bounded nesting depth. */
export function orderEditorProfilesContext(profiles: readonly { quantity?: unknown; configuration?: unknown }[],
  options: { budget?: number; selectedIndex?: number | null } = {}) {
  const selected = validProfileIndex(options.selectedIndex, profiles.length);
  const indices = [...(selected === null ? [] : [selected]), ...profiles.map((_, index) => index)
    .filter(index => index !== selected)].slice(0, 20);
  const rows: Array<{ index: number; quantity: number | null } & ReturnType<typeof summarizeNativeProfileConfiguration>> = [];
  let used = 2;
  const budget = Math.max(0, Math.min(options.budget ?? 6000, 6000));
  for (const index of indices) {
    const profile = profiles[index];
    const row = { index, quantity: number(profile.quantity), ...summarizeNativeProfileConfiguration(profile.configuration) };
    const size = JSON.stringify(row).length + 1;
    if (used + size > budget) continue;
    rows.push(row); used += size;
  }
  rows.sort((left, right) => left.index - right.index);
  return { profiles: rows, profilesTotal: profiles.length, profilesIncluded: rows.length, profilesTruncated: rows.length < profiles.length };
}

export function validProfileIndex(index: unknown, count: number): number | null {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < count ? index : null;
}

/** Current staged selections take the budget before optional saved-profile samples. */
export function orderScreenContext<T extends Record<string, unknown>>(primary: T, profiles: readonly { quantity?: unknown; configuration?: unknown }[],
  selectedIndex: number | null = null) {
  // Preserve the caller's projected field names; the sanitizer may omit fields.
  const context = fitScreenContextBudget(safeScreenData(primary) as Partial<T>, OPERATIONAL_CONTEXT_BUDGET - 180);
  const remaining = OPERATIONAL_CONTEXT_BUDGET - JSON.stringify(context).length - 180;
  return { ...context, ...orderEditorProfilesContext(profiles, { budget: remaining, selectedIndex }) };
}

function visibleRows<T, R>(rows: readonly T[], project: (row: T, index: number) => R, limit = 15, budget = 6000) {
  const items: R[] = [];
  let used = 2;
  for (const [index, row] of rows.slice(0, limit).entries()) {
    const item = project(row, index);
    const size = JSON.stringify(item).length + 1;
    if (used + size > budget) break;
    items.push(item);
    used += size;
  }
  return { rows: items, totalVisible: rows.length, includedRows: items.length, truncated: items.length < rows.length };
}

export type VisibleOrderRow = {
  id?: unknown; reference?: unknown; client?: unknown; title?: unknown; dueDate?: unknown;
  loadingDate?: unknown; badges?: readonly unknown[]; expanded?: boolean;
  stages?: readonly (readonly [unknown, unknown])[];
};

function orderRow(row: VisibleOrderRow) {
  return {
    id: text(row.id, 96), reference: text(row.reference, 96), client: text(row.client),
    title: text(row.title), dueDate: text(row.dueDate, 40),
    ...(row.loadingDate !== undefined ? { loadingDate: text(row.loadingDate, 40) } : {}),
    badges: (row.badges ?? []).slice(0, 8).map(value => text(value, 80)).filter(value => value !== null),
    ...(row.expanded !== undefined ? { expanded: row.expanded } : {}),
    ...(row.expanded ? { stages: (row.stages ?? []).slice(0, 6).map(([station, state]) => ({
      station: text(station, 40), state: text(state, 40)
    })) } : {})
  };
}

export function dashboardScreenContext(input: {
  loading: boolean; ordersError: boolean; verifiedTotal: number | null;
  kpis: { total: number; active: number; today: number; completedToday: number } | null;
  recentOrders: readonly VisibleOrderRow[];
  trends: { dates: readonly string[]; total: readonly number[] } | null;
}) {
  const kpis = input.loading ? null : input.kpis;
  return {
    screen: 'dashboard', loading: input.loading,
    unavailable: { orders: !input.loading && input.ordersError, kpiBreakdown: !input.loading && !kpis,
      trend: !input.loading && !input.trends },
    displayedKpis: input.loading ? null : {
      total: number(kpis?.total ?? input.verifiedTotal), active: number(kpis?.active),
      today: number(kpis?.today), completedToday: number(kpis?.completedToday)
    },
    recentOrders: visibleRows(input.loading || input.ordersError ? [] : input.recentOrders, orderRow, 5),
    trend: !input.loading && input.trends ? visibleRows(input.trends.dates, (date, index) => ({
      date: text(date, 40), orders: number(input.trends!.total[index])
    }), 30, 2400) : null
  };
}

export function orderListScreenContext(input: {
  loading: boolean; refreshing: boolean; error: boolean; hasLoadedOnce: boolean;
  search: string; status: string; sortKey: string; sortAsc: boolean;
  page: number; pageSize: number; totalPages: number; matchingOrders: number;
  counts: { total: number; active: number; urgent: number; drafts?: number };
  rows: readonly VisibleOrderRow[];
}) {
  const initialLoading = input.loading && !input.hasLoadedOnce;
  return {
    screen: 'orders-list', loading: input.loading, refreshing: input.refreshing, unavailable: input.error,
    dataVerified: input.hasLoadedOnce && !input.error,
    showingPreviousResults: input.hasLoadedOnce && (input.error || input.refreshing),
    filters: { search: text(input.search, 240), status: text(input.status, 40),
      sort: text(input.sortKey, 40), direction: input.sortAsc ? 'ascending' : 'descending' },
    pagination: { page: input.page, pageSize: input.pageSize, totalPages: input.totalPages,
      matchingOrders: input.hasLoadedOnce ? input.matchingOrders : null },
    counts: input.hasLoadedOnce ? { total: number(input.counts.total), active: number(input.counts.active),
      urgent: number(input.counts.urgent),
      ...(input.counts.drafts !== undefined ? { drafts: number(input.counts.drafts) } : {}) } : null,
    visibleOrders: visibleRows(initialLoading ? [] : input.rows, orderRow, 20)
  };
}

export type VisibleStockMaterial = {
  id?: unknown; code?: unknown; sku?: unknown; name_en?: unknown; category?: unknown;
  thickness_mm?: unknown; stock?: unknown; min_stock?: unknown; unit?: unknown;
};

export function inventoryCatalogScreenContext(input: {
  loading: boolean; error: boolean; search: string; category: string; lowStockOnly: boolean;
  lowStockCount: number; canManage: boolean; rows: readonly VisibleStockMaterial[];
}) {
  return {
    screen: 'inventory-catalog', loading: input.loading, unavailable: input.error, canManage: input.canManage,
    filters: { search: text(input.search, 240), category: text(input.category, 80), lowStockOnly: input.lowStockOnly },
    lowStockCount: input.loading || input.error ? null : input.lowStockCount,
    visibleMaterials: visibleRows(input.loading || input.error ? [] : input.rows, row => ({
      id: text(row.id, 96), name: text(row.name_en || row.code), sku: text(row.sku, 96),
      category: text(row.category, 80), thicknessMm: number(row.thickness_mm), stock: number(row.stock),
      unit: text(row.unit, 24), lowStock: number(row.stock) !== null && number(row.min_stock) !== null
        ? Number(row.stock) <= Number(row.min_stock) : null
    }))
  };
}

export type VisibleCatalogMaterial = {
  id?: unknown; category?: unknown; code?: unknown; name_en?: unknown; thickness_options?: readonly unknown[];
  metadata?: { brand?: unknown; hex?: unknown; transmittance?: unknown } | null;
};

function catalogMaterial(row: VisibleCatalogMaterial) {
  return {
    id: text(row.id, 96), category: text(row.category, 80), code: text(row.code, 96),
    name: text(row.name_en || row.code), brand: text(row.metadata?.brand, 80),
    color: text(row.metadata?.hex, 24), transmittance: text(row.metadata?.transmittance, 40),
    thicknessOptionsMm: (row.thickness_options ?? []).slice(0, 5).map(number).filter(value => value !== null),
    additionalThicknessOptions: Math.max(0, (row.thickness_options?.length ?? 0) - 5)
  };
}

export type MaterialEditorFields = {
  category: string; code: string; nameEn: string; nameRu: string; nameLv: string;
  thicknessOptions: string; hex: string; brand: string; colorCode: string; type: string;
  transmittance: string; voltage: string; wattage: string; colorTemp: string; ledCount: string;
  length: string; ipRating: string; width: string; height: string; diameter: string;
  weight: string; packSize: string; minOrder: string;
};

export function adminMaterialsScreenContext(input: {
  loading: boolean; error: boolean; search: string; category: string; canManage: boolean;
  rows: readonly VisibleCatalogMaterial[];
  editor: null | {
    mode: 'create' | 'edit'; selected: VisibleCatalogMaterial | null;
    saving: boolean; error: boolean; unsavedChanges: boolean; form: MaterialEditorFields;
    groups: { sheet: boolean; electronics: boolean; filament: boolean; hardware: boolean };
  };
}) {
  const editor = input.canManage ? input.editor : null;
  const form = editor?.form;
  return {
    screen: 'admin-materials', loading: input.loading, unavailable: input.error, canManage: input.canManage,
    filters: { search: text(input.search, 240), category: text(input.category, 80) },
    visibleMaterials: visibleRows(input.loading ? [] : input.rows, catalogMaterial, 15, 4500),
    editor: editor && form ? {
      mode: editor.mode, persisted: editor.mode === 'edit', unsavedChanges: editor.unsavedChanges,
      saving: editor.saving, validationError: editor.error,
      selectedMaterial: editor.selected ? catalogMaterial(editor.selected) : null,
      // Read the current draft, not the saved metadata; hidden category-specific fields are omitted.
      fields: {
        category: text(form.category, 80), code: text(form.code, 96), nameEn: text(form.nameEn),
        nameRu: text(form.nameRu), nameLv: text(form.nameLv), brand: text(form.brand, 80),
        hex: text(form.hex, 24), colorCode: text(form.colorCode, 80), type: text(form.type, 80),
        width: text(form.width, 80), height: text(form.height, 80), packSize: text(form.packSize, 80),
        minOrder: text(form.minOrder, 80),
        ...(editor.groups.sheet ? { thicknessOptions: text(form.thicknessOptions, 160),
          transmittance: text(form.transmittance, 80) } : {}),
        ...(editor.groups.electronics ? { voltage: text(form.voltage, 80), wattage: text(form.wattage, 80),
          colorTemp: text(form.colorTemp, 80), ledCount: text(form.ledCount, 80), ipRating: text(form.ipRating, 80) } : {}),
        ...(editor.groups.electronics || editor.groups.hardware ? { length: text(form.length, 80) } : {}),
        ...(editor.groups.filament ? { diameter: text(form.diameter, 80), weight: text(form.weight, 80) } : {})
      }
    } : null
  };
}
