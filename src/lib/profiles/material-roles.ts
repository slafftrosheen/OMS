import type { CatalogMaterial } from './material-catalog';

export type ProfileMaterialRole = 'face' | 'back' | 'sides' | 'frame' | 'mainCable';

export const PROFILE_PRINT_MATERIAL_CATEGORIES = [
  'FDM_PLA', 'FDM_PETG', 'FDM_ABS', 'FDM_ASA', 'FDM_TPU', 'FDM_OTHER',
  'RESIN_ANYCUBIC', 'RESIN_ELEGOO', 'RESIN_OTHER'
];

/** Catalog process identity; a filament's diameter is never a sheet thickness. */
export function isProfilePrintMaterial(category: unknown): boolean {
  return typeof category === 'string' && /^(?:FDM|RESIN)(?:_|$)/i.test(category);
}

/**
 * Query categories include legacy ALU_SHEET rows because earlier imports placed
 * flat bars and tubes there. Candidate filtering below separates their forms;
 * neither the database nor an already saved selection is rewritten.
 */
export const PROFILE_MATERIAL_CATEGORIES: Record<ProfileMaterialRole, string[]> = {
  face: ['ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'ALU_SHEET', 'ALU_COMPOSITE', 'PVC_FOAM', ...PROFILE_PRINT_MATERIAL_CATEGORIES],
  back: ['ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'ALU_SHEET', 'ALU_COMPOSITE', 'PVC_FOAM', ...PROFILE_PRINT_MATERIAL_CATEGORIES],
  // Keep former side-profile choices available to the selected-value lookup.
  // filterProfileMaterials still excludes them from new side choices.
  sides: ['ALU_SHEET', 'ALU_PROFILE', 'ALU_FLAT_BAR'],
  frame: ['ALU_PROFILE', 'ALU_FLAT_BAR', 'ALU_SHEET'],
  mainCable: ['WIRE']
};

type AluminiumForm = 'sheet' | 'composite' | 'profile' | 'flat';

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase().replace(/[_-]+/g, ' ') : '';
}

function recordedForm(value: unknown): AluminiumForm | undefined {
  const form = normalized(value);
  if (/^(?:sheet|plate|sheet metal|aluminium sheet|aluminum sheet)$/.test(form)) return 'sheet';
  if (/^(?:composite|composite panel|aluminium composite|aluminum composite)$/.test(form)) return 'composite';
  if (/^(?:flat|flat bar|flatbar|flat stock|flatstock|bar|solid bar)$/.test(form)) return 'flat';
  if (/^(?:profile|extrusion|tube|square tube|round tube|rectangular tube|angle|channel)$/.test(form)) return 'profile';
  return undefined;
}

/** Resolve only form, never alloy, dimensions or structural suitability. */
export function getAluminiumForm(material: CatalogMaterial): AluminiumForm | undefined {
  if (!/^ALU(?:MIN(?:I)?UM)?(?:_|$)/i.test(material.category)) return undefined;
  const metadata = material.metadata || {};
  for (const field of ['product_form', 'form', 'type']) {
    const form = recordedForm(metadata[field]);
    if (form) return form;
  }

  // An explicit form wins over these narrow legacy identity fallbacks.
  const identity = [material.code, material.name_en, material.name_ru, material.name_lv]
    .filter(value => typeof value === 'string').join(' ').toLocaleLowerCase();
  if (/(?:^|[\s_-])flat(?:[\s_-]*(?:bar|stock))?(?:[\s_-]|$)|плоск(?:ая|ий)\s+полос|алюминиев(?:ая|ый)\s+полос|alumīnija\s+josl/i.test(identity)) return 'flat';
  if (/(?:^|[\s_-])(?:profile|tube|extrusion|angle)(?:[\s_-]|$)|профил|труб|profils|caurul/i.test(identity)) return 'profile';
  if (material.category === 'ALU_COMPOSITE') return 'composite';
  if (material.category === 'ALU_FLAT_BAR') return 'flat';
  if (material.category === 'ALU_PROFILE') return 'profile';
  if (material.category === 'ALU_SHEET') return 'sheet';
  return undefined;
}

function isMainCable(material: CatalogMaterial): boolean {
  if (material.category !== 'WIRE') return false;
  const metadata = material.metadata || {};
  const application = normalized(metadata.cable_application);
  // Explicit application describes the catalog purpose, not electrical approval.
  if (['power', 'mains', 'power cable', 'mains cable', 'sign supply', 'main sign', 'main sign cable', 'external power'].includes(application)) return true;
  if (['signal', 'signal cable', 'control', 'control cable', 'data', 'data cable', 'internal', 'internal wiring', 'led interconnect', 'led jumper'].includes(application)) return false;

  const identity = [metadata.cable_type, metadata.type, metadata.control, material.code, material.name_en]
    .filter(value => typeof value === 'string').join(' ').toLocaleLowerCase();
  if (/signal|control cable|data cable|li[hy]?c[hy]|liycy|liy(?:st)y|lihh|led.{0,12}(?:jumper|connector|interconnect)|speaker|microphone|coax|ethernet|usb/.test(identity)) return false;
  if (/(?:^|[^a-z0-9])h0[357](?:vv|rn|rr|bq|bb|vn)[a-z]?(?:-|\b)/i.test(identity)) return true;
  return typeof metadata.cores === 'number' && Number.isInteger(metadata.cores) && metadata.cores >= 2;
}

/**
 * Candidate-only projection. Keep the original array for resolving a selected
 * saved value, including a legacy choice that is no longer offered here.
 */
export function filterProfileMaterials(
  materials: readonly CatalogMaterial[], role?: ProfileMaterialRole
): CatalogMaterial[] {
  if (!role) return [...materials];
  const allowed = new Set(PROFILE_MATERIAL_CATEGORIES[role]);
  return materials.flatMap(material => {
    if (!allowed.has(material.category)) return [];
    if (role === 'mainCable') return isMainCable(material) ? [material] : [];
    const form = getAluminiumForm(material);
    if (role === 'frame') {
      if (form !== 'profile' && form !== 'flat') return [];
      const category = form === 'flat' ? 'ALU_FLAT_BAR' : 'ALU_PROFILE';
      return [material.category === category ? material : { ...material, category }];
    }
    if (form === 'profile' || form === 'flat') return [];
    return [material];
  });
}
