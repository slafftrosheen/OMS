import { derived, get, writable } from 'svelte/store';
import type { Category, Item, Movement, MovementKind, Section, Unit } from './types';

// Re-export types for convenience
export type { Category, Item, Movement, MovementKind, Section, Unit } from './types';

export type NewItemInput = Omit<Item, 'id' | 'updatedAt'> & {
  id?: string;
  updatedAt?: string;
};

export type ItemUpdate = Partial<Omit<Item, 'id'>> & { updatedAt?: string };

export type MovementOptions = {
  by?: string;
  note?: string;
  refPO?: string;
  unit?: Unit;
};

export type SearchField =
  | 'sku'
  | 'name'
  | 'category'
  | 'location'
  | 'colorCode'
  | 'vendor';

export type SearchOptions = {
  fields?: SearchField[];
  caseSensitive?: boolean;
};

export type CsvOptions = {
  separator?: string;
  includeHeader?: boolean;
};

export type MovementFilterOptions = {
  itemId?: string;
  kind?: MovementKind | MovementKind[];
  from?: string;
  to?: string;
};

type MovementQuantityBreakdown = Partial<
  Record<
    Unit,
    {
      IN: number;
      OUT: number;
      ADJUST: number;
    }
  >
>;

export type MovementStats = {
  total: number;
  byKind: Record<MovementKind, number>;
  unitQuantities: MovementQuantityBreakdown;
  itemsAffected: number;
};

export type InventorySummary = {
  totalItems: number;
  lowStockItems: number;
  categories: Record<Category, { total: number; lowStock: number }>;
  latestUpdate: string | null;
};

export type SectionId = Section;
export const SECTIONS: SectionId[] = ['materials', 'leftovers', 'paints', 'tools', 'cons', 'electronics', '3dprinting'];

// Svelte stores for reactive UI
export const items = writable<Item[]>([]);
export const movements = writable<Movement[]>([]);
export const isLoading = writable<boolean>(false);

// Load items from API
export async function loadItems(): Promise<Item[]> {
  if (typeof window === 'undefined') return [];
  
  isLoading.set(true);
  try {
    const response = await fetch('/api/inventory/items');
    if (response.ok) {
      const data = await response.json();
      items.set(data);
      return data;
    }
  } catch (err) {
    console.error('Failed to load inventory items:', err);
  } finally {
    isLoading.set(false);
  }
  return [];
}

// Load movements from API
export async function loadMovements(limit = 50): Promise<Movement[]> {
  if (typeof window === 'undefined') return [];
  
  try {
    const response = await fetch(`/api/inventory/movements?limit=${limit}`);
    if (response.ok) {
      const data = await response.json();
      movements.set(data);
      return data;
    }
  } catch (err) {
    console.error('Failed to load movements:', err);
  }
  return [];
}

export function getItem(itemId: string) {
  return get(items).find((item) => item.id === itemId) ?? null;
}

export function findItemBySku(sku: string) {
  const needle = sku.trim().toLowerCase();
  if (!needle) return null;
  return get(items).find((item) => item.sku.toLowerCase() === needle) ?? null;
}

export async function addItem(input: NewItemInput): Promise<Item | null> {
  try {
    const response = await fetch('/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    
    if (response.ok) {
      const newItem = await response.json();
      items.update((list) => [newItem, ...list]);
      return newItem;
    }
  } catch (err) {
    console.error('Failed to add item:', err);
  }
  return null;
}

export async function createItem(partial: Partial<Item> = {}): Promise<Item | null> {
  const newItem: Partial<Item> = {
    sku: '',
    name: '',
    category: 'HARDWARE',
    section: 'materials',
    group: 'General',
    subgroup: 'General',
    unit: 'PCS',
    stock: 0,
    min: 0,
    ...partial
  };
  return addItem(newItem as NewItemInput);
}

export async function updateItem(itemId: string, patch: ItemUpdate): Promise<Item | null> {
  try {
    const response = await fetch(`/api/inventory/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    
    if (response.ok) {
      const updated = await response.json();
      items.update((list) =>
        list.map((item) => (item.id === itemId ? { ...item, ...updated } : item))
      );
      return updated;
    }
  } catch (err) {
    console.error('Failed to update item:', err);
  }
  return null;
}

export async function removeItem(itemId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/inventory/items/${itemId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      items.update((list) => list.filter((item) => item.id !== itemId));
      movements.update((records) => records.filter((m) => m.itemId !== itemId));
      return true;
    }
  } catch (err) {
    console.error('Failed to remove item:', err);
  }
  return false;
}

export async function recordMovement(
  itemId: string,
  kind: MovementKind,
  qty: number,
  options: MovementOptions = {}
): Promise<Movement | null> {
  const target = getItem(itemId);
  if (!target) return null;

  try {
    const response = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        kind,
        qty,
        unit: options.unit ?? target.unit,
        by: options.by ?? 'admin',
        note: options.note,
        refPO: options.refPO
      })
    });

    if (response.ok) {
      const result = await response.json();
      
      // Update local store with new stock
      items.update((list) =>
        list.map((item) => {
          if (item.id !== itemId) return item;
          return { ...item, stock: result.newStock, updatedAt: new Date().toISOString() };
        })
      );

      // Add movement to local store
      const movement: Movement = {
        id: result.id,
        itemId,
        kind,
        qty,
        unit: result.unit,
        by: options.by ?? 'admin',
        at: new Date().toISOString(),
        note: options.note,
        refPO: options.refPO
      };
      movements.update((records) => [movement, ...records]);

      return movement;
    }
  } catch (err) {
    console.error('Failed to record movement:', err);
  }
  return null;
}

export async function move(itemId: string, kind: MovementKind, qty: number, by = 'admin', note?: string) {
  const result = await recordMovement(itemId, kind, qty, { by, note });
  
  if (result) {
    const item = getItem(itemId);
    if (item && item.stock <= item.min) {
      Promise.all([
        import('$lib/stores/toast'),
        import('$lib/notify/bus')
      ]).then(([{ announce }, { push }]) => {
        announce(`Low stock: ${item.sku} (${item.stock} ${item.unit})`, 'warning');
        push('warn', `Low stock: ${item.sku} (${item.stock} ${item.unit})`);
      });
    }
  }
  
  return result;
}

export function movementsForItem(itemId: string) {
  return get(movements).filter((movement) => movement.itemId === itemId);
}

export const lowStock = derived(items, ($items) => $items.filter((it) => it.stock <= it.min));

export function listLowStock() {
  return get(lowStock);
}

export function searchItems(query: string, options: SearchOptions = {}) {
  const defaultFields: SearchField[] = ['sku', 'name', 'category', 'location', 'colorCode', 'vendor'];
  const { caseSensitive = false, fields = defaultFields } = options;
  const trimmed = query.trim();
  if (!trimmed) return get(items);
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
  const haystack = get(items);
  return haystack.filter((item) =>
    fields.some((field) => {
      const raw = item[field];
      if (raw == null) return false;
      const text = String(raw);
      const target = caseSensitive ? text : text.toLowerCase();
      return target.includes(needle);
    })
  );
}

export function recentMovements(limit = 25) {
  const history = [...get(movements)];
  history.sort((a, b) => b.at.localeCompare(a.at));
  return history.slice(0, Math.max(0, limit));
}

export function filterMovements(options: MovementFilterOptions = {}) {
  const allowedKinds = Array.isArray(options.kind)
    ? options.kind
    : options.kind
    ? [options.kind]
    : null;
  const from = options.from ?? null;
  const to = options.to ?? null;

  return get(movements).filter((movement) => {
    if (options.itemId && movement.itemId !== options.itemId) return false;
    if (allowedKinds && !allowedKinds.includes(movement.kind)) return false;
    if (from && movement.at < from) return false;
    if (to && movement.at > to) return false;
    return true;
  });
}

export function movementStats(options: MovementFilterOptions = {}): MovementStats {
  const sample = filterMovements(options);
  const byKind: Record<MovementKind, number> = { IN: 0, OUT: 0, ADJUST: 0 };
  const unitQuantities: MovementQuantityBreakdown = {} as MovementQuantityBreakdown;
  const touched = new Set<string>();

  for (const record of sample) {
    byKind[record.kind] += 1;
    touched.add(record.itemId);
    if (!unitQuantities[record.unit]) {
      unitQuantities[record.unit] = { IN: 0, OUT: 0, ADJUST: 0 };
    }
    unitQuantities[record.unit][record.kind] += record.qty;
  }

  return {
    total: sample.length,
    byKind,
    unitQuantities,
    itemsAffected: touched.size
  };
}

export function inventorySummary(): InventorySummary {
  const all = get(items);
  const low = get(lowStock);
  const categories: Record<Category, { total: number; lowStock: number }> = {
    ACRYLIC: { total: 0, lowStock: 0 },
    ALUMINIUM: { total: 0, lowStock: 0 },
    STEEL: { total: 0, lowStock: 0 },
    ACP: { total: 0, lowStock: 0 },
    VINYL: { total: 0, lowStock: 0 },
    PAINT: { total: 0, lowStock: 0 },
    ADHESIVE: { total: 0, lowStock: 0 },
    HARDWARE: { total: 0, lowStock: 0 },
    INSTRUMENT: { total: 0, lowStock: 0 },
    ELECTRONICS: { total: 0, lowStock: 0 },
    LED: { total: 0, lowStock: 0 },
    LED_STRIP: { total: 0, lowStock: 0 },
    PSU: { total: 0, lowStock: 0 },
    '3D_PRINTING': { total: 0, lowStock: 0 },
    RESIN: { total: 0, lowStock: 0 },
    FILAMENT: { total: 0, lowStock: 0 },
    SCREWS: { total: 0, lowStock: 0 },
    MOUNTING: { total: 0, lowStock: 0 },
    CONSUMABLE: { total: 0, lowStock: 0 }
  };

  let latest: string | null = null;

  for (const item of all) {
    const bucket = categories[item.category];
    if (bucket) {
      bucket.total += 1;
    }
    if (!latest || item.updatedAt > latest) {
      latest = item.updatedAt;
    }
  }

  for (const item of low) {
    const bucket = categories[item.category];
    if (bucket) {
      bucket.lowStock += 1;
    }
  }

  return {
    totalItems: all.length,
    lowStockItems: low.length,
    categories,
    latestUpdate: latest
  };
}

export function itemsByCategory(category: Category) {
  return get(items).filter((item) => item.category === category);
}

export function recentlyUpdatedItems(fromISO: string): Item[] {
  if (!fromISO) return [];
  return get(items).filter((item) => item.updatedAt >= fromISO);
}

export function resetInventory(next: Item[]) {
  items.set(next);
  movements.set([]);
}

export function exportInventoryCsv(options: CsvOptions = {}) {
  const { separator = ',', includeHeader = true } = options;
  const header = [
    'id',
    'sku',
    'name',
    'category',
    'unit',
    'stock',
    'min',
    'location',
    'vendor',
    'note',
    'colorCode',
    'thicknessMM',
    'leftover.lengthMM',
    'leftover.widthMM',
    'leftover.heightMM',
    'leftover.weightKG',
    'leftover.bin',
    'updatedAt'
  ];

  const rows = get(items).map((item) => [
    item.id,
    item.sku,
    item.name,
    item.category,
    item.unit,
    item.stock,
    item.min,
    item.location ?? '',
    item.vendor ?? '',
    item.note ?? '',
    item.colorCode ?? '',
    item.thicknessMM ?? '',
    item.leftover?.lengthMM ?? '',
    item.leftover?.widthMM ?? '',
    item.leftover?.heightMM ?? '',
    item.leftover?.weightKG ?? '',
    item.leftover?.bin ?? '',
    item.updatedAt
  ]);

  const escape = (value: unknown) => {
    const text = String(value ?? '');
    const needsQuotes = /[",\n]/.test(text) || text.includes(separator) || /^\s|\s$/.test(text);
    if (!needsQuotes) return text;
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = rows.map((row) => row.map(escape).join(separator));
  if (includeHeader) {
    lines.unshift(header.map(escape).join(separator));
  }
  return lines.join('\n');
}
