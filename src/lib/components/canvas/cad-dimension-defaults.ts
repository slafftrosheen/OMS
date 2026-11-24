import type { Editor } from '@tldraw/tldraw';
import { CAD_DIMENSION_MARKERS, type CadDimensionMarker } from './cad-dimension-settings';
import { CAD_MAX_COORDINATE, cadMmPerPixel, readCadSettings, type CadSettings } from './cad-settings';
import { canWriteCadSnapSettings } from './cad-snap-settings';
import { drawingTransaction } from './drawing-commands';

export const CAD_DIMENSION_DEFAULTS_META_KEY = 'omsDimensionDefaults';
export const CAD_DIMENSION_BASE_TEXT_HEIGHT = 14;
const VIEW_OFFSET = 30;

export interface CadDimensionDefaults {
  version: 1;
  mode: 'view' | 'physical';
  textHeightMm: number;
  offsetMm: number;
  precision: number | null;
  showUnit: boolean;
  marker: CadDimensionMarker;
}
export const DEFAULT_CAD_DIMENSION_DEFAULTS: CadDimensionDefaults = {
  version: 1, mode: 'view', textHeightMm: 3.5, offsetMm: 8,
  precision: null, showUnit: true, marker: 'auto',
};

export function validateDimensionDefaults(value: unknown): CadDimensionDefaults | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as CadDimensionDefaults;
  if (candidate.version !== 1 || !['view', 'physical'].includes(candidate.mode) ||
      !Number.isFinite(candidate.textHeightMm) || candidate.textHeightMm <= 0 || candidate.textHeightMm > CAD_MAX_COORDINATE ||
      !Number.isFinite(candidate.offsetMm) || Math.abs(candidate.offsetMm) > CAD_MAX_COORDINATE ||
      !(candidate.precision === null || Number.isInteger(candidate.precision) && candidate.precision >= 0 && candidate.precision <= 6) ||
      typeof candidate.showUnit !== 'boolean' || !CAD_DIMENSION_MARKERS.includes(candidate.marker)) return null;
  return { version: 1, mode: candidate.mode, textHeightMm: candidate.textHeightMm, offsetMm: candidate.offsetMm,
    precision: candidate.precision, showUnit: candidate.showUnit, marker: candidate.marker };
}

/** Only new dimensions read these page preferences. Existing records retain
 * their exact annotation geometry and presentation. Physical fields use mm. */
export function readDimensionDefaults(editor: Editor): CadDimensionDefaults {
  return validateDimensionDefaults(editor.getCurrentPage().meta[CAD_DIMENSION_DEFAULTS_META_KEY]) ?? { ...DEFAULT_CAD_DIMENSION_DEFAULTS };
}
export function dimensionDefaultsRevision(editor: Editor): string {
  const page = editor.getCurrentPage();
  return JSON.stringify([page.id, page.meta.omsCad ?? null, page.meta[CAD_DIMENSION_DEFAULTS_META_KEY] ?? null]);
}
export function writeDimensionDefaults(editor: Editor, expectedRevision: string, value: CadDimensionDefaults): boolean {
  const defaults = validateDimensionDefaults(value);
  if (!defaults || !canWriteCadSnapSettings(editor) || dimensionDefaultsRevision(editor) !== expectedRevision ||
      defaults.mode === 'physical' && !dimensionStyleForCreation(1, readCadSettings(editor), defaults)) return false;
  const page = editor.getCurrentPage();
  const meta = { ...page.meta, [CAD_DIMENSION_DEFAULTS_META_KEY]: JSON.parse(JSON.stringify(defaults)) };
  if (JSON.stringify(page.meta) === JSON.stringify(meta)) return true;
  return drawingTransaction(editor, () => {
    if (!canWriteCadSnapSettings(editor) || dimensionDefaultsRevision(editor) !== expectedRevision)
      throw new Error('Dimension defaults changed');
    editor.updatePage({ id: page.id, meta });
    if (editor.getCurrentPageId() !== page.id || JSON.stringify(editor.getCurrentPage().meta) !== JSON.stringify(meta))
      throw new Error('Dimension defaults were refused');
  });
}

export interface DimensionCreationStyle {
  decorationScale: number;
  offset: number;
  precision: number | null;
  showUnit: boolean;
  marker: CadDimensionMarker;
}

/** Freeze screen-readable defaults into document coordinates once, when the
 * annotation is created. Later zooming must never change the saved geometry. */
export function dimensionStyleForCreation(zoom: number, settings: CadSettings | null = null,
  value: CadDimensionDefaults = DEFAULT_CAD_DIMENSION_DEFAULTS): DimensionCreationStyle | null {
  const defaults = validateDimensionDefaults(value);
  if (!defaults || !Number.isFinite(zoom) || zoom <= 0 || defaults.mode === 'physical' && !settings) return null;
  const mm = settings ? cadMmPerPixel(settings) : 1;
  const decorationScale = defaults.mode === 'physical' ? defaults.textHeightMm / mm / CAD_DIMENSION_BASE_TEXT_HEIGHT : 1 / zoom;
  const offset = defaults.mode === 'physical' ? defaults.offsetMm / mm : VIEW_OFFSET / zoom;
  if (!Number.isFinite(decorationScale) || decorationScale <= 0 || decorationScale > CAD_MAX_COORDINATE ||
      !Number.isFinite(offset) || Math.abs(offset) > CAD_MAX_COORDINATE) return null;
  return { decorationScale, offset, precision: defaults.precision, showUnit: defaults.showUnit, marker: defaults.marker };
}
export function dimensionCreationStyle(editor: Editor): DimensionCreationStyle | null {
  return dimensionStyleForCreation(editor.getZoomLevel(), readCadSettings(editor), readDimensionDefaults(editor));
}

/** View mode follows the same compact arc placement for linked and manual
 * angles. Physical mode uses the requested signed offset from the first ray. */
export function dimensionAngularOffset(length: number, style: DimensionCreationStyle, mode: CadDimensionDefaults['mode']): number | null {
  if (!Number.isFinite(length) || length <= 0) return null;
  const radius = mode === 'physical' ? length + style.offset
    : Math.max(8 * style.decorationScale, Math.min(length * .7, 80 * style.decorationScale));
  if (!Number.isFinite(radius) || radius < 8 * style.decorationScale - 1e-8 || Math.abs(radius - length) > CAD_MAX_COORDINATE) return null;
  return radius - length;
}
