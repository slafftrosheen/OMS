import { swatchTextColor } from '../profiles/components/fields/swatch-contrast';

/** Category accents describe the part's role, never its physical product color. */
export const MATERIAL_SELECTION_COLORS = {
  face: { light: ['#E3F2F4', '#124853'], dark: ['#133339', '#B5E5EC'] },
  back: { light: ['#E8EEF5', '#293F5D'], dark: ['#253244', '#CCD9ED'] },
  sides: { light: ['#E4F1EC', '#1D4F3B'], dark: ['#18382C', '#BFE8D5'] },
  film: { light: ['#F0E7F5', '#553368'], dark: ['#382944', '#E5CAF4'] },
  paint: { light: ['#F5E7EF', '#6F3350'], dark: ['#402533', '#F2C8DC'] },
  led: { light: ['#FFF0C9', '#674400'], dark: ['#40321A', '#F7D98F'] },
  psu: { light: ['#E7EDF9', '#2F467C'], dark: ['#26334F', '#C7D8FF'] },
  cable: { light: ['#DCF2EF', '#154F49'], dark: ['#163B37', '#B1E5DD'] },
  connector: { light: ['#FFEADB', '#713C16'], dark: ['#432C1C', '#FFD3B2'] },
  print3d: { light: ['#EEE7FA', '#513680'], dark: ['#322545', '#DDC8FB'] },
  frame: { light: ['#E8EEF1', '#304752'], dark: ['#293840', '#CBDDE6'] },
  material: { light: ['#EEEFF1', '#3D4654'], dark: ['#30343C', '#DEE3ED'] }
} as const;

export type MaterialSelectionTone = keyof typeof MATERIAL_SELECTION_COLORS;

export function materialSelectionTone(category = '', role = '', summaryKind = ''): MaterialSelectionTone {
  if (summaryKind === 'led' || summaryKind === 'psu' || summaryKind === 'cable') return summaryKind;
  if (role === 'mainCable') return 'cable';
  if (role === 'face' || role === 'back' || role === 'sides' || role === 'frame') return role;
  const name = category.toUpperCase();
  if (/(?:^|_)(?:PAINT|PANTONE|RAL)(?:_|$)/.test(name)) return 'paint';
  if (/VINYL|ORACAL|FILM/.test(name)) return 'film';
  if (/FDM|PRINT|FILAMENT|RESIN/.test(name)) return 'print3d';
  if (/CONNECTOR|ACCESSORY/.test(name)) return 'connector';
  if (/PSU|POWER_SUPPLY/.test(name)) return 'psu';
  if (/CABLE|WIRE/.test(name)) return 'cable';
  if (/LED/.test(name)) return 'led';
  if (/PROFILE|FLAT_BAR|FRAME/.test(name)) return 'frame';
  if (/ACRYLIC/.test(name)) return 'face';
  if (/SHEET|COMPOSITE/.test(name)) return 'back';
  return 'material';
}

/** Only opaque catalog/custom hex values can become an actual color swatch. */
export function materialSwatch(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!match) return undefined;
  const hex = match[1].length === 3
    ? [...match[1]].map(character => character.repeat(2)).join('')
    : match[1];
  return `#${hex.toUpperCase()}`;
}

/** The shared CSS resolves the theme; a real swatch overrides only its own badge. */
export function materialColorVariables(tone: MaterialSelectionTone, hex?: unknown): string {
  const palette = MATERIAL_SELECTION_COLORS[tone];
  const swatch = materialSwatch(hex);
  return `--material-light-surface:${palette.light[0]};--material-light-ink:${palette.light[1]};`
    + `--material-dark-surface:${palette.dark[0]};--material-dark-ink:${palette.dark[1]};`
    + (swatch ? `--material-swatch:${swatch};--material-swatch-ink:${swatchTextColor(swatch)};` : '');
}
