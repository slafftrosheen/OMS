import { materialSwatch } from '$lib/materials/selection-colors';
import { normalizeThicknessValue } from '$lib/materials/thickness-options';
import { frameBadgeLabel } from './frame-sizing';

export type ProfileMaterialBadgeKind = 'sheet' | 'film' | 'paint' | 'print3d' | 'connector' | 'frame';

/** The resolved catalog entry is presentation data, never a replacement saved value. */
export interface ProfileMaterialBadgeSource {
  code?: string;
  name_en?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface ProfileMaterialBadgeOptions {
  value: string;
  shortName?: string;
  category?: string;
  thickness?: string;
  hex?: string;
  kind?: ProfileMaterialBadgeKind;
  dimensions?: string;
}

export interface ProfileMaterialBadge {
  label: string;
  hex?: string;
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const scalar = (value: unknown): string => text(value) || (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
const metadataOf = (source: ProfileMaterialBadgeSource | null | undefined): Record<string, unknown> =>
  source?.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata : {};
const genericIdentity = /^(?:ALU|ALUMINIUM|ALUMINUM|PLEX|ACRYLIC|FDM|RESIN|FILAMENT)$/i;
const aluminiumCategory = /^ALU(?:MIN(?:I)?UM)?(?:_|$)/i;
const printCategory = /^(?:FDM|FILAMENT|RESIN|PRINT3D)(?:_|$)/i;

// Visual representations of recorded color names, not manufacturer color measurements.
const neutralColors: Record<string, string> = { black: '#000000', white: '#FFFFFF', grey: '#808080', gray: '#808080' };
const printColors: Record<string, string> = {
  ...neutralColors, 'midnight black': '#000000', 'snow white': '#FFFFFF', 'traffic white': '#FFFFFF', brown: '#A52A2A'
};
const NATURAL_ALUMINIUM = '#C4C9CE';

function rgbSwatch(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(channel =>
    typeof channel === 'number' && Number.isInteger(channel) && channel >= 0 && channel <= 255)) return;
  return '#' + value.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function physicalColor(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions, category: string): string | undefined {
  const metadata = metadataOf(source);
  const assigned = materialSwatch(options.hex) || materialSwatch(metadata.hex)
    || materialSwatch(metadata.color) || rgbSwatch(metadata.rgb);
  if (assigned) return assigned;

  const colorName = (text(metadata.color) || text(metadata.colorName)).toLowerCase();
  if (printCategory.test(category) && printColors[colorName]) return printColors[colorName];
  if (aluminiumCategory.test(category) && !/COMPOSITE/.test(category)) {
    if (neutralColors[colorName]) return neutralColors[colorName];
    // An unknown recorded coating color must not silently become bare aluminium.
    if (!colorName || /^(?:natural(?: aluminium| aluminum)?|aluminium|aluminum|silver|metal|metallic)$/.test(colorName)) {
      return NATURAL_ALUMINIUM;
    }
  }
}

function kindFor(category: string): ProfileMaterialBadgeKind | undefined {
  if (/PAINT|PANTONE|RAL/.test(category)) return 'paint';
  if (/VINYL|ORACAL|FILM/.test(category)) return 'film';
  if (printCategory.test(category)) return 'print3d';
  if (/PROFILE|FLAT_BAR/.test(category)) return 'frame';
  if (/ACRYLIC|ALU|PVC/.test(category)) return 'sheet';
  if (/CONNECTOR|ACCESSORY/.test(category)) return 'connector';
}

function identity(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions): string {
  if (text(source?.name_en)) return text(source?.name_en);
  if (genericIdentity.test(options.value.trim()) && text(options.shortName) && !genericIdentity.test(text(options.shortName))) return text(options.shortName);
  return options.value;
}

function withThickness(label: string, thickness: string | undefined): string {
  const normalized = normalizeThicknessValue(thickness);
  return normalized ? `${label}/${normalized}` : label;
}

function acrylicCode(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions): string {
  const metadata = metadataOf(source);
  const recorded = text(metadata.colorCode);
  if (recorded) return recorded;
  const short = [metadata.short_name, metadata.shortName, options.shortName].map(text)
    .find(value => /^[A-Z0-9]{2,10}$/i.test(value) && !genericIdentity.test(value));
  if (short) return short;
  const candidates = [source?.code, source?.name_en, options.value].filter(Boolean).join(' ').replace(/[_-]/g, ' ');
  return /\b(?:\d[A-Z][A-Z0-9]{2,5}|[A-Z]{2}\d{2,4})\b/i.exec(candidates)?.[0].toUpperCase()
    || /\b(?:OPAL|CLEAR|WHITE)\b/i.exec(candidates)?.[0].toUpperCase() || '';
}

function sheetLabel(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions, category: string): string {
  let label = identity(source, options);
  if (/^ACRYLIC(?:_|$)/.test(category)) {
    const code = acrylicCode(source, options);
    if (code) label = `PLEX ${code}`;
  } else if (aluminiumCategory.test(category)) {
    const metadata = metadataOf(source);
    const form = [metadata.product_form, metadata.form, metadata.type, source?.code, label].map(text).join(' ');
    if (/COMPOSITE/.test(category)) label = ['ALU COMPOSITE', text(metadata.colorCode)].filter(Boolean).join(' ');
    else if (!/PROFILE|FLAT_BAR/.test(category) && !/\b(?:flat(?:[ _-]*(?:bar|stock))?|profile|tube|extrusion|angle|channel)\b/i.test(form)) label = 'ALU ';
  } else if (category === 'PVC_FOAM') label = 'PVC';
  // ALU's spaced slash is the workshop's compact sheet notation.
  return withThickness(options.thickness ? label : label.trimEnd(), options.thickness);
}

function filmLabel(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions, category: string): string {
  const metadata = metadataOf(source);
  const name = identity(source, options);
  const candidates = [source?.code, options.shortName, name].map(text).join(' ');
  if (!/ORACAL/.test(category) && !/\bORACAL\b/i.test(text(metadata.brand) + ' ' + candidates)) return name;
  const pair = /(?:^|[\s_/-])(\d{4})[\s_/-]+(\d{2,3})(?:[A-Z])?(?=$|[\s_/-])/i.exec(candidates);
  const series = scalar(metadata.series) || pair?.[1] || /\b\d{4}\b/.exec(candidates.replace(/_/g, ' '))?.[0] || '';
  const shortCode = /^(\d{2,3})(?:[A-Z])?$/i.exec(text(options.shortName));
  const catalogCode = /^(\d{2,3})(?:[A-Z])?$/i.exec(text(source?.code));
  const color = scalar(metadata.colorCode) || pair?.[2] || shortCode?.[1] || catalogCode?.[1] || '';
  if (series && color) return `ORA ${series}/${color}`;
  return color ? `ORA ${color}` : name;
}

function paintLabel(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions, category: string): string {
  const metadata = metadataOf(source);
  const name = identity(source, options);
  if (/PANTONE/.test(category)) {
    const short = [metadata.short_name, metadata.shortName, options.shortName].map(text)
      .find(value => /^(?:PANTONE[_\s-]+)?\d[\d_\s-]*[A-Z]{0,3}$/i.test(value));
    const code = text(metadata.colorCode) || short || text(source?.code) || name;
    return `Pantone ${code.replace(/^PANTONE[_\s-]+/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()}`;
  }
  if (/RAL/.test(category)) {
    const candidates = [metadata.colorCode, source?.code, options.shortName, name].map(text).join(' ').replace(/[_-]/g, ' ');
    const code = /\b\d{4}\b/.exec(candidates)?.[0];
    if (code) return `RAL ${code}`;
  }
  return name;
}

const header = (value: string): string => value.split(/\s*[·|]\s*/, 1)[0].trim();
function withoutBrand(value: string, brand: string): string {
  if (brand && value.toLowerCase().startsWith(brand.toLowerCase()) && /^(?:\s|$)/.test(value.slice(brand.length))) return value.slice(brand.length).trim();
  return value;
}

function printLabel(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions, category: string): string {
  const metadata = metadataOf(source);
  let brand = text(metadata.brand);
  const name = identity(source, options);
  const isResin = /^RESIN(?:_|$)/.test(category) || /\bresin\b/i.test(text(metadata.type));
  if (isResin) {
    if (!brand && category === 'RESIN_ANYCUBIC') brand = 'Anycubic';
    if (!brand && category === 'RESIN_ELEGOO') brand = 'Elegoo';
    const family = withoutBrand(text(metadata.product_family) || header(name), brand)
      .replace(/\b(?:photopolymer|resin)\b/ig, '').replace(/\s+/g, ' ').trim();
    return [brand, 'Resin', family].filter(Boolean).join(' ');
  }
  if (!printCategory.test(category)) return name;
  const family = (text(metadata.product_family) || text(metadata.material) || (/^FDM_(?!OTHER$)/.test(category) ? category.slice(4) : ''))
    .replace(/^refill\s+/i, '');
  if (brand && family) return ['FDM', brand, withoutBrand(family, brand)].join(' ');
  return 'FDM ' + header(name).replace(/^(?:FDM|Filament)\s+/i, '');
}

function connectorLabel(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions): string {
  const metadata = metadataOf(source);
  const brand = text(metadata.brand);
  const model = text(metadata.model) || text(metadata.manufacturer_part_number);
  if (model) return [brand, withoutBrand(model, brand)].filter(Boolean).join(' ');
  const name = identity(source, options);
  const wago = /\bWAGO[\s_-]*(\d{3,4}-\d{3,5})\b/i.exec([source?.code, name, options.shortName].map(text).join(' '));
  return wago ? `WAGO ${wago[1]}` : header(name);
}

/**
 * Compact labels for closed draft-profile selections only. Catalog/editor names,
 * saved identities and technical facts remain untouched. Unresolved custom text
 * is never classified from its wording; a resolved row or recorded category is
 * required before applying a catalog-family abbreviation.
 */
export function getProfileMaterialBadge(source: ProfileMaterialBadgeSource | null | undefined, options: ProfileMaterialBadgeOptions): ProfileMaterialBadge {
  if (!options.value) return { label: '' };
  const category = (text(source?.category) || text(options.category)).toUpperCase();
  const kind = options.kind || kindFor(category);
  const known = !!source || !!category;
  // Older profiles sometimes kept only a generic value and their meaningful
  // short name. Restore that identity without guessing a missing category.
  let label = identity(source, options);
  if (kind === 'frame') {
    if (known && aluminiumCategory.test(category)) label = label.replace(/\b(?:aluminium|aluminum|alu)\b/ig, 'ALU');
    label = frameBadgeLabel(label, options.dimensions, options.thickness);
  } else if (known) {
    if (kind === 'sheet') label = sheetLabel(source, options, category);
    if (kind === 'film') label = filmLabel(source, options, category);
    if (kind === 'paint') label = paintLabel(source, options, category);
    if (kind === 'print3d') label = printLabel(source, options, category);
    if (kind === 'connector') label = connectorLabel(source, options);
  } else if (kind === 'sheet') label = withThickness(label, options.thickness);
  const hex = physicalColor(source, options, category);
  return hex ? { label, hex } : { label };
}
