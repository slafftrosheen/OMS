import type { CatalogMaterial } from './material-catalog';
import { getAluminiumForm } from './material-roles';

type Material = Pick<CatalogMaterial, 'category' | 'code' | 'metadata' | 'thickness_options' | 'name_en' | 'name_ru' | 'name_lv'>;

/** A complete RAL Classic designation. Numbers inside product names, film
 * codes, measurements and qualified finishes are different source facts. */
export function ralClassicCode(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return;
  return /^(?:ral[\s_-]*)?(\d{4})$/i.exec(String(value).normalize('NFKC').trim())?.[1];
}

export function materialRalCode(material: Pick<Material, 'category'> & Partial<Pick<Material, 'code' | 'metadata'>>) {
  if (material.category !== 'PAINT_RAL') return;
  return ralClassicCode(material.metadata?.ralCode) ?? ralClassicCode(material.metadata?.colorCode)
    ?? ralClassicCode(material.code) ?? /^RAL[ _-]*(\d{4})(?:[ _-]|$)/i.exec(material.code ?? '')?.[1];
}

const familyTerms: Record<string, string[]> = {
  ALU_SHEET: ['alu', 'aluminium', 'aluminum', 'alu sheet', 'alu sheets', 'aluminium sheet', 'aluminium sheets',
    'aluminum sheet', 'aluminum sheets', 'sheet aluminium', 'sheet aluminum', 'алюминий', 'алюминиевый лист',
    'лист алюминия', 'листовой алюминий', 'alumīnijs', 'alumīnija loksne', 'alumīnija loksnes'],
  ALU_COMPOSITE: ['acm', 'acp', 'alu composite', 'aluminium composite', 'aluminum composite', 'aluminium composite panel'],
  PVC_FOAM: ['foam pvc', 'foamed pvc', 'pvc foam', 'вспененный пвх', 'putots pvc'],
  ACRYLIC_GS: ['acrylic gs', 'gs acrylic', 'pmma gs', 'cast acrylic', 'литой акрил', 'liets akrils'],
  ACRYLIC_XT: ['acrylic xt', 'xt acrylic', 'pmma xt', 'extruded acrylic', 'экструдированный акрил', 'ekstrudēts akrils']
};
const familyKey = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/[\s_-]+/g, ' ');
const families = new Map(Object.entries(familyTerms).flatMap(([category, terms]) =>
  terms.map(term => [familyKey(term), category] as const)));

const finishTerms: Record<string, string[]> = {
  gloss: ['gloss', 'glossy', 'глянец', 'глянцевый', 'spīdīgs'],
  matt: ['matt', 'matte', 'mat', 'матовый', 'матовая', 'matēts'],
  satin: ['satin', 'сатин', 'satīns']
};
const finishes = new Map(Object.entries(finishTerms).flatMap(([finish, terms]) =>
  terms.map(term => [familyKey(term), finish] as const)));

type WorkshopTerm = { family: string; thicknessMm?: number } | { ral: string; finish?: string };

/** Accept only complete terms. Unknown grades, finishes and measurements
 * remain attached to their source value for a staff decision. */
export function parseWorkshopTerm(query: string): WorkshopTerm | undefined {
  const value = familyKey(query);
  const family = families.get(value);
  if (family) return { family };
  // Parse the untouched separators first so ranges, signs, alloys and panel
  // dimensions cannot turn into a single positive stock thickness.
  const raw = query.normalize('NFKC').trim();
  const trailing = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:mm|мм)$/iu.exec(raw);
  const leading = /^(\d+(?:[.,]\d+)?)\s*(?:mm|мм)\s+(.+)$/iu.exec(raw);
  if (trailing || leading) {
    const material = trailing ? trailing[1] : leading![2];
    const stock = families.get(familyKey(material));
    const thicknessMm = Number((trailing ? trailing[2] : leading![1]).replace(',', '.'));
    if (stock && thicknessMm > 0 && Number.isFinite(thicknessMm)) return { family: stock, thicknessMm };
  }
  const paint = /^(?:ral *)?(\d{4})(?: (.+))?$/.exec(value);
  if (!paint) return;
  if (!paint[2]) return { ral: paint[1] };
  const finish = finishes.get(paint[2]);
  if (finish) return { ral: paint[1], finish };
}

export function matchesWorkshopTerm(material: Material, term: WorkshopTerm): boolean {
  if ('family' in term) {
    if (term.thicknessMm !== undefined && !material.thickness_options?.includes(term.thicknessMm)) return false;
    return term.family === 'ALU_SHEET' ? getAluminiumForm(material) === 'sheet' : material.category === term.family;
  }
  if (materialRalCode(material) !== term.ral) return false;
  if (!term.finish) return true;
  const finish = material.metadata?.finish;
  return typeof finish === 'string' && finishes.get(familyKey(finish)) === term.finish;
}
