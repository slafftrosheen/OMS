import type { CatalogMaterial } from './material-catalog';
import { getAluminiumForm } from './material-roles';

type Material = Pick<CatalogMaterial, 'category' | 'code' | 'metadata' | 'thickness_options' | 'name_en' | 'name_ru' | 'name_lv'>;

/** A complete RAL Classic designation. Numbers inside product names, film
 * codes, measurements and qualified finishes are different source facts. */
export function ralClassicCode(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return;
  return /^(?:(?:ral|рал)[\s_-]*)?(\d{4})$/iu.exec(String(value).normalize('NFKC').trim())?.[1];
}

export function materialRalCode(material: Pick<Material, 'category'> & Partial<Pick<Material, 'code' | 'metadata' | 'name_en' | 'name_ru' | 'name_lv'>>) {
  if (material.category !== 'PAINT_RAL') return;
  const code = ralClassicCode(material.metadata?.ralCode) ?? ralClassicCode(material.metadata?.colorCode)
    ?? ralClassicCode(material.code) ?? /^(?:RAL|РАЛ)[ _-]*(\d{4})(?:[ _-]|$)/iu.exec(material.code ?? '')?.[1];
  if (code) return code;
  // Some suppliers use a private SKU and put the designation only in the
  // product name. Accept one explicit number shared by the labelled names.
  const codes = new Set<string>();
  for (const name of [material.name_en, material.name_ru, material.name_lv]) {
    if (!name || !/^(?:ral|рал)[\s_-]*\d/iu.test(name.trim())) continue;
    const match = /^(?:ral|рал)[\s_-]*(\d{4})(?:[\s_-]+[^\d]*)?$/iu.exec(name.trim());
    if (!match) return;
    codes.add(match[1]);
  }
  if (codes.size === 1) return [...codes][0];
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
  gloss: ['gloss', 'glossy', 'глянец', 'глянцевый', 'глянцевая', 'spīdīgs', 'glancēts'],
  matt: ['matt', 'matte', 'mat', 'матовый', 'матовая', 'matēts', 'matēta'],
  satin: ['satin', 'сатин', 'satīns']
};
const finishes = new Map(Object.entries(finishTerms).flatMap(([finish, terms]) =>
  terms.map(term => [familyKey(term), finish] as const)));

type FilmTerm = { series: string; colour: string; suffix?: string };
type WorkshopTerm = { family: string; thicknessMm?: number } | { ral: string; finish?: string } | FilmTerm;

// A film designation needs both parts. Leading zeroes identify the colour.
function oracalTerm(value: string): FilmTerm | undefined {
  const match = /^(?:(?:oracal®?|ora|оракал)[\s_-]*)?(\d{3,4})(?:\s*[/_-]\s*|\s+)(\d{2,3})([a-z])?$/iu.exec(value.normalize('NFKC').trim());
  return match ? {series:match[1], colour:match[2], ...(match[3] && {suffix:match[3].toUpperCase()})} : undefined;
}

/** Accept only complete terms. Unknown grades, finishes and measurements
 * remain attached to their source value for a staff decision. */
export function parseWorkshopTerm(query: string): WorkshopTerm | undefined {
  const value = familyKey(query);
  const family = families.get(value);
  if (family) return { family };
  const film = oracalTerm(query);
  if (film) return film;
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
  const paint = /^(?:(?:ral|рал) *)?(\d{4})(?: (.+))?$/u.exec(value);
  if (paint && !paint[2]) return { ral: paint[1] };
  const leadingFinish = paint ? null : /^(.+?) (?:(?:ral|рал) *)?(\d{4})$/u.exec(value);
  const ral = paint?.[1] ?? leadingFinish?.[2], qualifier = paint?.[2] ?? leadingFinish?.[1];
  if (!ral || !qualifier) return;
  const finish = finishes.get(qualifier.replace(/^\(([^()]+)\)$/, '$1'));
  if (finish) return { ral, finish };
}

export function materialRalFinish(material: Material): string | undefined {
  const finish = material.metadata?.finish;
  if (typeof finish === 'string' && finish.trim()) return finishes.get(familyKey(finish)) ?? familyKey(finish);
  const sku = parseWorkshopTerm(material.code);
  return sku && 'ral' in sku ? sku.finish : undefined;
}

export function matchesWorkshopTerm(material: Material, term: WorkshopTerm): boolean {
  if ('series' in term) {
    if (material.category !== 'VINYL_ORACAL') return false;
    const sku = oracalTerm(material.code);
    const shortSku = /^(\d{2,3})([A-Z])?$/i.exec(material.code);
    const series = material.metadata?.series ?? sku?.series;
    const skuColour = sku?.colour ?? shortSku?.[1];
    const colour = material.metadata?.colorCode ?? skuColour;
    const suffix = sku?.suffix ?? shortSku?.[2]?.toUpperCase();
    return String(series) === term.series && String(colour) === term.colour &&
      (!term.suffix || (suffix === term.suffix && skuColour === term.colour));
  }
  if ('family' in term) {
    if (term.thicknessMm !== undefined && !material.thickness_options?.includes(term.thicknessMm)) return false;
    return term.family === 'ALU_SHEET' ? getAluminiumForm(material) === 'sheet' : material.category === term.family;
  }
  if (materialRalCode(material) !== term.ral) return false;
  return !term.finish || materialRalFinish(material) === term.finish;
}
