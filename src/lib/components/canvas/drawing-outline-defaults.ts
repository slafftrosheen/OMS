import { DefaultColorStyle, getDefaultColorTheme, type Editor, type JsonObject } from '@tldraw/tldraw';
import { CAD_HAIRLINE_FALLBACK_MM, VECTOR_DEFAULT_PAINT, validVectorPaint, type VectorPaint } from './cad-paint';
import { cadMmPerPixel, DEFAULT_CAD_SETTINGS, readCadSettings, validateCadSettings, type CadSettings } from './cad-settings';
import { assertCadEditable, cadRevision, CadOperationError, makeCadPlan, type CadPlan } from './cad-plans';
import { drawingTransaction } from './drawing-commands';
import { OUTLINE_FIELDS, outlinePatchFromInput, type OutlineInput, type OutlinePatch } from './drawing-outline';
import type { CadContour } from './cad-curves';
import { canWriteCadSnapSettings } from './cad-snap-settings';

export const OUTLINE_DEFAULTS_META_KEY = 'omsOutlineDefaults';
type OutlineDefaults = { version: 1; outline: OutlinePatch };
export interface OutlineDefaultsPlan {
  target: 'defaults'; revision: string; count: 0; samples: VectorPaint[]; defaults: OutlineDefaults;
}

/** Persist physical millimetres, independent of the active display unit/scale.
 * Only creation reads this preference; legacy shapes keep their exact paint. */
function savedDefaults(editor: Editor): OutlinePatch | null {
  const value = editor.getCurrentPage().meta[OUTLINE_DEFAULTS_META_KEY] as unknown as OutlineDefaults;
  if (!value || value.version !== 1 || !value.outline || typeof value.outline !== 'object' ||
      Array.isArray(value.outline) || Object.keys(value.outline).some(key => !OUTLINE_FIELDS.includes(key as any))) return null;
  const paint = { ...VECTOR_DEFAULT_PAINT, ...value.outline };
  return validVectorPaint(paint) ? structuredClone(value.outline) : null;
}
export function newCadOutlinePaint(editor: Editor, settings: CadSettings = readCadSettings(editor) ?? DEFAULT_CAD_SETTINGS): VectorPaint {
  const saved = savedDefaults(editor);
  const color = editor.getStyleForNextShape?.(DefaultColorStyle) ?? 'black';
  const paint: VectorPaint = { ...VECTOR_DEFAULT_PAINT, stroke: getDefaultColorTheme({ isDarkMode: false })[color]?.solid ?? '#000000',
    hairline: true, strokeWidth: CAD_HAIRLINE_FALLBACK_MM, dash: [], ...(saved ?? {}) };
  const mm = cadMmPerPixel(settings);
  return { ...paint, strokeWidth: paint.strokeWidth / mm, dash: paint.dash.map(value => value / mm), dashOffset: paint.dashOffset / mm };
}
export function newCadOutlineMeta(editor: Editor, settings?: CadSettings): JsonObject {
  const paint = newCadOutlinePaint(editor, settings);
  if (!validVectorPaint(paint)) throw new CadOperationError('limit');
  return { omsVectorPaint: JSON.parse(JSON.stringify(paint)) };
}
/** Interactive tools reject an unrepresentable default before creating artwork. */
export function tryNewCadOutlineMeta(editor: Editor, settings?: CadSettings): JsonObject | null {
  try { return newCadOutlineMeta(editor, settings); } catch { return null; }
}

/** Reviewed primitive geometry freezes its paint with the preview. Operations
 * derived from existing artwork must keep using makeCadPlan/source paint. */
export function makeNewCadShapePlan(editor: Editor, settings: CadSettings, contours: CadContour[], name: string): CadPlan {
  return makeCadPlan(editor, settings, contours, { name, shapes: [{ type: 'cad-bezier', x: 0, y: 0,
    props: { contours, fillRule: 'evenodd', color: editor.getStyleForNextShape?.(DefaultColorStyle) ?? 'black' },
    meta: newCadOutlineMeta(editor, settings) }] });
}

export function prepareOutlineDefaultsPlan(editor: Editor, input: OutlineInput, settings: CadSettings): OutlineDefaultsPlan {
  assertCadEditable(editor);
  if (!canWriteCadSnapSettings(editor)) throw new CadOperationError('busy');
  if (!validateCadSettings(settings)) throw new CadOperationError('invalid');
  const patch = outlinePatchFromInput(input, settings), paint = { ...newCadOutlinePaint(editor, settings), ...patch };
  if (!validVectorPaint(paint)) throw new CadOperationError('invalid');
  const mm = cadMmPerPixel(settings);
  const physical: OutlinePatch = { ...patch };
  if (physical.strokeWidth !== undefined) physical.strokeWidth *= mm;
  if (physical.dash !== undefined) physical.dash = physical.dash.map(value => value * mm);
  if (physical.dashOffset !== undefined) physical.dashOffset *= mm;
  // Unchecked properties remain live creation styles. In particular, setting
  // width must not freeze the palette's current next-object colour.
  const outline = { ...(savedDefaults(editor) ?? {}), ...physical };
  if (!validVectorPaint({ ...VECTOR_DEFAULT_PAINT, ...outline })) throw new CadOperationError('limit');
  return { target: 'defaults', revision: cadRevision(editor), count: 0, samples: [paint], defaults: { version: 1, outline } };
}

/** Call inside the palette's existing drawingTransaction before changing the
 * native next colour. An explicit palette choice replaces a custom saved
 * stroke override without resetting width, dash, caps or joins. */
export function useNativeCadOutlineColor(editor: Editor): boolean {
  if (!canWriteCadSnapSettings(editor)) return false;
  const saved = savedDefaults(editor);
  if (!saved || !Object.hasOwn(saved, 'stroke')) return true;
  const outline = { ...saved }; delete outline.stroke;
  const page = editor.getCurrentPage(), meta = { ...page.meta,
    [OUTLINE_DEFAULTS_META_KEY]: JSON.parse(JSON.stringify({ version: 1, outline })) };
  editor.updatePage({ id: page.id, meta });
  return JSON.stringify(editor.getCurrentPage().meta) === JSON.stringify(meta);
}
export function applyOutlineDefaultsPlan(editor: Editor, plan: OutlineDefaultsPlan): boolean {
  try {
    if (!canWriteCadSnapSettings(editor) || plan.target !== 'defaults' || plan.revision !== cadRevision(editor)) return false;
    assertCadEditable(editor);
    const defaults = plan.defaults;
    if (defaults?.version !== 1 || !defaults.outline ||
        Object.keys(defaults.outline).some(key => !OUTLINE_FIELDS.includes(key as any)) ||
        !validVectorPaint({ ...VECTOR_DEFAULT_PAINT, ...defaults.outline })) return false;
    const page = editor.getCurrentPage(), meta = { ...page.meta, [OUTLINE_DEFAULTS_META_KEY]: JSON.parse(JSON.stringify(defaults)) };
    if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(defaults).length > 1_900_000) return false;
    return drawingTransaction(editor, () => {
      assertCadEditable(editor);
      if (!canWriteCadSnapSettings(editor)) throw new CadOperationError('busy');
      if (plan.revision !== cadRevision(editor)) throw new CadOperationError('stale');
      editor.updatePage({ id: page.id, meta });
      if (JSON.stringify(editor.getCurrentPage().meta) !== JSON.stringify(meta)) throw new CadOperationError('failed');
    });
  } catch { return false; }
}
