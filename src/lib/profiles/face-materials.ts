import { extractShortName } from './helpers';
import { normalizeThicknessValue } from '$lib/materials/thickness-options';

/** Stored in the existing native profile configuration JSON. */
export interface FaceMaterialSelection {
  id: string;
  value: string;
  thickness?: string;
  hex?: string;
  shortName?: string;
  category?: string;
  thicknessOptions?: number[];
  [key: string]: unknown;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const thicknesses = (value: unknown): number[] => Array.isArray(value)
  ? [...new Set(value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
  : [];
const storedThicknesses = (value: unknown): number[] | undefined =>
  Array.isArray(value) ? thicknesses(value) : undefined;

/** Row identity is local to a profile; this also works on internal HTTP hosts. */
export function nextFaceMaterialId(rows: readonly FaceMaterialSelection[]): string {
  const ids = new Set(rows.map(row => row.id));
  let next = rows.length + 1;
  while (ids.has(`face-material-${next}`)) next++;
  return `face-material-${next}`;
}

/** Read old scalar selections without changing the source configuration. */
export function readFaceMaterials(section: unknown): FaceMaterialSelection[] {
  const source = record(section);
  if (Array.isArray(source.faceMaterials)) {
    const usedIds = new Set<string>();
    return source.faceMaterials.filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map((item, index) => {
        const entry = record(item);
        let id = string(entry.id) || `face-material-${index + 1}`;
        while (usedIds.has(id)) id += '-copy';
        usedIds.add(id);
        return {
          ...entry, id, value: string(entry.value),
          thickness: string(entry.thickness), hex: string(entry.hex),
          shortName: string(entry.shortName), category: string(entry.category),
          thicknessOptions: storedThicknesses(entry.thicknessOptions)
        };
      });
  }
  return [{
    id: 'legacy-face', value: string(source.face),
    thickness: string(source.faceThickness), hex: string(source.faceHex),
    shortName: string(source.faceShort), category: string(source.faceCategory),
    thicknessOptions: storedThicknesses(source.faceThicknessOptions)
  }];
}

/** Mirror the first selected row for older consumers, only on an explicit edit. */
export function withFaceMaterials<T extends Record<string, unknown>>(
  section: T, rows: FaceMaterialSelection[]
): T & { faceMaterials: FaceMaterialSelection[]; face: string } {
  const primary = rows.find(row => row.value.trim()) ?? rows[0];
  return {
    ...section, faceMaterials: [...rows],
    face: primary?.value ?? '', faceThickness: primary?.thickness ?? '',
    faceHex: primary?.hex ?? '', faceShort: primary?.shortName ?? '',
    faceCategory: primary?.category ?? '',
    faceThicknessOptions: primary?.thicknessOptions
  };
}

export interface ProfileMaterialChange {
  value: string;
  hex: string;
  shortName?: string;
  material: {
    code?: string;
    name_en?: string;
    category?: string;
    thickness_options?: number[];
    metadata?: Record<string, unknown>;
  } | null;
}

/** Keep a compatible thickness when choosing a material, including legacy '3'. */
export function applyProfileMaterialSelection(
  previous: FaceMaterialSelection, selection: ProfileMaterialChange,
  fallbackCategory = 'ACRYLIC'
): FaceMaterialSelection {
  const options = thicknesses(selection.material?.thickness_options);
  const missingCatalogOptions = !!selection.material && !Array.isArray(selection.material.thickness_options);
  const normalized = normalizeThicknessValue(previous.thickness ?? '');
  const retained = options.some(value => `${value}mm` === normalized);
  const thickness = !selection.value ? '' : options.length
    ? retained ? previous.thickness : `${options[0]}mm`
    : (!selection.material && !previous.category) ||
      (missingCatalogOptions && previous.category === selection.material?.category)
      ? previous.thickness ?? '' : '';
  return {
    ...previous, value: selection.value, thickness,
    hex: selection.hex, shortName: selection.value ? extractShortName(selection, fallbackCategory) : '',
    category: selection.material?.category ?? '', thicknessOptions: missingCatalogOptions ? undefined : options
  };
}
