export interface ThicknessOption {
  thickness: number;
  unit: string;
  display_name?: string;
}

/** Catalog categories and legacy material names share the same fallback families. */
export function normalizeMaterialType(materialType: string): string {
  const type = (materialType || '').trim().toUpperCase();
  // Composite panels must be matched before the generic ALU prefix.
  if (type.includes('DIBOND') || type.includes('ALUCOBOND') ||
      (type.includes('ALU') && type.includes('COMPOSITE'))) return 'DIBOND';
  if (type.includes('PLEXIGLAS') || type.includes('ACRYLIC') || type.includes('PLEXI')) return 'ACRYLIC';
  if (type.includes('PVC') || type.includes('FOREX')) return 'PVC';
  if (type.includes('ALU')) return 'ALUMINUM';
  if (type.includes('MDF')) return 'MDF';
  if (type.includes('WOOD') || type.includes('PLYWOOD')) return 'WOOD';
  if (type.includes('STEEL') || type.includes('METAL')) return 'STEEL';
  if (type.includes('FILM') || type.includes('ORACAL') || type.includes('PRINT')) return 'FILM';
  return type;
}

/** Compare old bare numbers with newer unit-suffixed values without rewriting saved data. */
export function normalizeThicknessValue(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  const match = /^(\d+(?:[.,]\d+)?)\s*(?:mm)?$/i.exec(text);
  if (!match) return text;
  const thickness = Number(match[1].replace(',', '.'));
  return Number.isFinite(thickness) && thickness > 0 ? thickness + 'mm' : text;
}

export function createCatalogThicknessOptions(thicknesses: readonly number[] = []): ThicknessOption[] {
  return [...new Set(thicknesses.filter(value => Number.isFinite(value) && value > 0))]
    .sort((a, b) => a - b)
    .map(thickness => ({ thickness, unit: 'mm' }));
}

export function thicknessOptionValue(option: ThicknessOption): string {
  return normalizeThicknessValue(option.thickness + option.unit);
}

/** A failed lookup is distinct from a material with no standard thicknesses. */
export async function fetchThicknessOptions(
  materialType: string,
  {
    signal,
    timeoutMs = 10000,
    basePath = '',
    fetcher = fetch
  }: {
    signal?: AbortSignal;
    timeoutMs?: number;
    basePath?: string;
    fetcher?: typeof fetch;
  } = {}
): Promise<ThicknessOption[]> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener('abort', abort, { once: true });
  }
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Thickness lookup timed out', 'TimeoutError'));
  }, timeoutMs);

  try {
    controller.signal.throwIfAborted();
    const type = encodeURIComponent(normalizeMaterialType(materialType));
    const response = await fetcher(basePath + '/api/material-thickness-options?materialType=' + type, {
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Thickness lookup failed (' + response.status + ')');
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('Invalid thickness options');

    const seen = new Set<string>();
    const options: ThicknessOption[] = [];
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue;
      const thickness = Number(item.thickness);
      if (!Number.isFinite(thickness) || thickness <= 0) continue;
      const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim().toLowerCase() : 'mm';
      const option: ThicknessOption = {
        thickness,
        unit,
        display_name: typeof item.display_name === 'string' ? item.display_name : undefined
      };
      const key = thicknessOptionValue(option);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(option);
    }
    return options.sort((a, b) => a.thickness - b.thickness);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
