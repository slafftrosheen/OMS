/** Shared catalog data for the native profile pickers. Loading never changes a saved selection. */
export interface CatalogMaterial {
  id: number;
  category: string;
  code: string;
  name_en: string;
  name_ru?: string;
  name_lv?: string;
  thickness_options: number[];
  metadata: {
    hex?: string;
    short_name?: string;
    colorCode?: string;
    type?: string;
    brand?: string;
    [key: string]: unknown;
  };
}

export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  ACRYLIC_XT: 'Extruded acrylic (XT)',
  ACRYLIC_GS: 'Cast acrylic (GS)',
  ACRYLIC_LED: 'LED acrylic',
  ALU_SHEET: 'Aluminium sheets',
  ALU_COMPOSITE: 'Aluminium composite',
  PVC_FOAM: 'Foamed PVC',
  ALU_PROFILE: 'Aluminium profiles',
  VINYL_ORACAL: 'Oracal film',
  PAINT_RAL: 'RAL paint',
  PAINT_PANTONE: 'Pantone paint',
  LED_MODULE: 'LED modules',
  LED_STRIP: 'LED strips',
  PSU_MEANWELL: 'Mean Well power supplies',
  WIRE: 'Cables and wires',
  LED_ACCESSORY: 'LED accessories'
};

export function buildMaterialCatalogUrl(base: string, category: string, categories: string[]): string {
  const url = `${base}/api/materials`;
  if (category) return `${url}?category=${encodeURIComponent(category)}`;
  const unique = [...new Set(categories.filter(Boolean))].sort();
  return unique.length ? `${url}?categories=${encodeURIComponent(unique.join(','))}` : url;
}

export function getMaterialCatalogView(
  materials: CatalogMaterial[],
  category: string,
  search: string,
  localizedCategoryLabels: Record<string, string> = {}
) {
  const counts = new Map<string, number>();
  for (const material of materials) counts.set(material.category, (counts.get(material.category) || 0) + 1);
  const categories = [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => ({ category, count }));
  const query = search.trim().toLocaleLowerCase();
  const matching = query
    ? materials.filter((material) => [
        material.name_en, material.name_ru, material.name_lv, material.code,
        material.category, MATERIAL_CATEGORY_LABELS[material.category], localizedCategoryLabels[material.category],
        material.metadata?.brand, material.metadata?.short_name, material.metadata?.colorCode
      ].some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(query)))
    : category ? materials.filter((material) => material.category === category) : [];
  const grouped = new Map<string, CatalogMaterial[]>();
  for (const material of matching) {
    const group = grouped.get(material.category) || [];
    group.push(material);
    grouped.set(material.category, group);
  }
  return {
    categories,
    groups: [...grouped].sort(([a], [b]) => a.localeCompare(b))
      .map(([category, materials]) => ({ category, materials }))
  };
}

function parseCatalog(value: unknown): CatalogMaterial[] {
  if (!Array.isArray(value)) throw new Error('Invalid materials response');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof entry.code !== 'string' || !entry.code) {
      throw new Error('Invalid material in catalog');
    }
    return {
      ...entry,
      category: typeof entry.category === 'string' ? entry.category : 'OTHER',
      name_en: typeof entry.name_en === 'string' ? entry.name_en : entry.code,
      thickness_options: Array.isArray(entry.thickness_options)
        ? [...new Set(entry.thickness_options.map(Number).filter((n: number) => Number.isFinite(n) && n > 0))]
        : [],
      metadata: entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata) ? entry.metadata : {}
    } as CatalogMaterial;
  });
}

export function createMaterialCatalogLoader(
  fetcher: typeof fetch = (input, init) => fetch(input, init),
  { timeoutMs = 12000, cacheTtlMs = 60000 }: { timeoutMs?: number; cacheTtlMs?: number } = {}
) {
  const cache = new Map<string, { data: CatalogMaterial[]; timestamp: number }>();
  const pending = new Map<string, Promise<CatalogMaterial[]>>();

  function load(url: string, force = false): Promise<CatalogMaterial[]> {
    const cached = cache.get(url);
    if (!force && cached && Date.now() - cached.timestamp < cacheTtlMs) return Promise.resolve(cached.data);
    const existing = pending.get(url);
    if (existing) return existing;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Materials request timed out'));
      }, timeoutMs);
    });
    // Race as well as abort: some fetch adapters do not reject when aborted.
    const request = Promise.race([
      (async () => {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Materials request failed (${response.status})`);
        return parseCatalog(await response.json());
      })(),
      timeout
    ]).then((data) => {
      cache.set(url, { data, timestamp: Date.now() });
      return data;
    }).finally(() => {
      clearTimeout(timer);
      pending.delete(url);
    });
    pending.set(url, request);
    return request;
  }

  return { load };
}

export const materialCatalog = createMaterialCatalogLoader();
