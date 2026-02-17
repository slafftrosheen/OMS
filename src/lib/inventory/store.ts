import { derived, get, writable } from 'svelte/store';
import type { Category, Material, Movement, MovementKind, Section, Unit } from './types';

// Re-export types for convenience
export type { Category, Material, Movement, MovementKind, Section, Unit } from './types';

export type NewMaterialInput = Omit<Material, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type MaterialUpdate = Partial<Omit<Material, 'id'>> & { updated_at?: string };

export type MovementOptions = {
  by?: string;
  note?: string;
  refPO?: string;
  unit?: Unit;
};

export type SearchField =
  | 'sku'
  | 'name_en'
  | 'category'
  | 'location'
  | 'color_code'
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
  materialId?: string;
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
  materialsAffected: number;
};

export type InventorySummary = {
  totalMaterials: number;
  lowStockMaterials: number;
  categories: Record<Category, { total: number; lowStock: number }>;
  latestUpdate: string | null;
};

export type SectionId = Section;
export const SECTIONS: SectionId[] = ['materials', 'leftovers', 'paints', 'tools', 'cons', 'electronics', '3dprinting'];

// Svelte stores for reactive UI
export const materials = writable<Material[]>([]);
export const movements = writable<Movement[]>([]);
export const isLoading = writable<boolean>(false);

// Load materials from API
export async function loadMaterials(): Promise<Material[]> {
  if (typeof window === 'undefined') return [];

  isLoading.set(true);
  try {
    const response = await fetch('/api/inventory/items');
    if (response.ok) {
      const result = await response.json();
      // Handle both paginated response and direct array
      const data = result.data || result;
      materials.set(data);
      return data;
    }
  } catch (err) {
    console.error('Failed to load materials:', err);
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

export function getMaterial(materialId: string) {
  return get(materials).find((material) => material.id === materialId) ?? null;
}

export function findMaterialBySku(sku: string) {
  const needle = sku.trim().toLowerCase();
  if (!needle) return null;
  return get(materials).find((material) => material.sku?.toLowerCase() === needle) ?? null;
}

export async function addMaterial(input: NewMaterialInput): Promise<Material | null> {
  try {
    const response = await fetch('/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (response.ok) {
      const newMaterial = await response.json();
      materials.update((list) => [newMaterial, ...list]);
      return newMaterial;
    }
  } catch (err) {
    console.error('Failed to add material:', err);
  }
  return null;
}

export async function createMaterial(partial: Partial<Material> = {}): Promise<Material | null> {
  const newMaterial: Partial<Material> = {
    sku: '',
    code: 'INV-' + Date.now(),
    name_en: '',
    category: 'HARDWARE',
    section: 'materials',
    item_group: 'General',
    subgroup: 'General',
    unit: 'PCS',
    stock: 0,
    min_stock: 0,
    ...partial
  };
  return addMaterial(newMaterial as NewMaterialInput);
}

export async function updateMaterial(materialId: string, patch: MaterialUpdate): Promise<Material | null> {
  try {
    const response = await fetch(`/api/inventory/items/${materialId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });

    if (response.ok) {
      const updated = await response.json();
      materials.update((list) =>
        list.map((material) => (material.id === materialId ? { ...material, ...updated } : material))
      );
      return updated;
    }
  } catch (err) {
    console.error('Failed to update material:', err);
  }
  return null;
}

export async function removeMaterial(materialId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/inventory/items/${materialId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      materials.update((list) => list.filter((material) => material.id !== materialId));
      movements.update((records) => records.filter((m) => m.materialId !== materialId));
      return true;
    }
  } catch (err) {
    console.error('Failed to remove material:', err);
  }
  return false;
}

export async function recordMovement(
  materialId: string,
  kind: MovementKind,
  qty: number,
  options: MovementOptions = {}
): Promise<Movement | null> {
  const target = getMaterial(materialId);
  if (!target) return null;

  try {
    const response = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialId,
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
      materials.update((list) =>
        list.map((material) => {
          if (material.id !== materialId) return material;
          return { ...material, stock: result.newStock, updated_at: new Date().toISOString() };
        })
      );

      // Add movement to local store
      const movement: Movement = {
        id: result.id,
        materialId,
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

export async function move(materialId: string, kind: MovementKind, qty: number, by = 'admin', note?: string) {
  const result = await recordMovement(materialId, kind, qty, { by, note });

  if (result) {
    const material = getMaterial(materialId);
    if (material && material.stock <= material.min_stock) {
      Promise.all([
        import('$lib/stores/toast'),
        import('$lib/notify/bus')
      ]).then(([{ announce }, { push }]) => {
        announce(`Low stock: ${material.sku} (${material.stock} ${material.unit})`, 'warning');
        push('warn', `Low stock: ${material.sku} (${material.stock} ${material.unit})`);
      });
    }
  }

  return result;
}

export function movementsForMaterial(materialId: string) {
  return get(movements).filter((movement) => movement.materialId === materialId);
}

// Use a function instead of derived to avoid initialization order issues
export function getLowStockMaterials(): Material[] {
  return get(materials).filter((m) => m.stock <= m.min_stock);
}

export function listLowStock() {
  return getLowStockMaterials();
}

export function searchMaterials(query: string, options: SearchOptions = {}) {
  const defaultFields: SearchField[] = ['sku', 'name_en', 'category', 'location', 'color_code', 'vendor'];
  const { caseSensitive = false, fields = defaultFields } = options;
  const trimmed = query.trim();
  if (!trimmed) return get(materials);
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
  const haystack = get(materials);
  return haystack.filter((material) =>
    fields.some((field) => {
      const raw = material[field];
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
    if (options.materialId && movement.materialId !== options.materialId) return false;
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
    touched.add(record.materialId);
    if (!unitQuantities[record.unit]) {
      unitQuantities[record.unit] = { IN: 0, OUT: 0, ADJUST: 0 };
    }
    unitQuantities[record.unit][record.kind] += record.qty;
  }

  return {
    total: sample.length,
    byKind,
    unitQuantities,
    materialsAffected: touched.size
  };
}

export function inventorySummary(): InventorySummary {
  const all = get(materials);
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

  for (const material of all) {
    const bucket = categories[material.category];
    if (bucket) {
      bucket.total += 1;
    }
    if (!latest || material.updated_at > latest) {
      latest = material.updated_at;
    }
  }

  for (const material of low) {
    const bucket = categories[material.category];
    if (bucket) {
      bucket.lowStock += 1;
    }
  }

  return {
    totalMaterials: all.length,
    lowStockMaterials: low.length,
    categories,
    latestUpdate: latest
  };
}

export function materialsByCategory(category: Category) {
  return get(materials).filter((material) => material.category === category);
}

export function recentlyUpdatedMaterials(fromISO: string): Material[] {
  if (!fromISO) return [];
  return get(materials).filter((material) => material.updated_at >= fromISO);
}

export function resetInventory(next: Material[]) {
  materials.set(next);
  movements.set([]);
}

export function exportInventoryCsv(options: CsvOptions = {}) {
  const { separator = ',', includeHeader = true } = options;
  const header = [
    'id',
    'sku',
    'name_en',
    'category',
    'unit',
    'stock',
    'min_stock',
    'location',
    'vendor',
    'note',
    'color_code',
    'thickness_mm',
    'leftover_data.lengthMM',
    'leftover_data.widthMM',
    'leftover_data.heightMM',
    'leftover_data.weightKG',
    'leftover_data.bin',
    'updated_at'
  ];

  const rows = get(materials).map((material) => [
    material.id,
    material.sku || '',
    material.name_en || '',
    material.category,
    material.unit,
    material.stock,
    material.min_stock,
    material.location ?? '',
    material.vendor ?? '',
    material.note ?? '',
    material.color_code ?? '',
    material.thickness_mm ?? '',
    (material.leftover_data as any)?.lengthMM ?? '',
    (material.leftover_data as any)?.widthMM ?? '',
    (material.leftover_data as any)?.heightMM ?? '',
    (material.leftover_data as any)?.weightKG ?? '',
    (material.leftover_data as any)?.bin ?? '',
    material.updated_at
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

// Backwards compatibility aliases
export const getItem = getMaterial;
export const findItemBySku = findMaterialBySku;
export const addItem = addMaterial;
export const createItem = createMaterial;
export const updateItem = updateMaterial;
export const removeItem = removeMaterial;
export const searchItems = searchMaterials;
export const itemsByCategory = materialsByCategory;
export const recentlyUpdatedItems = recentlyUpdatedMaterials;
export const movementsForItem = movementsForMaterial;
