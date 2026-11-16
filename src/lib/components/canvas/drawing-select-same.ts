import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { validVectorPaint } from './cad-paint';
import { cadAppearanceGeometry, cadShapePaint } from './cad-shape-appearance';
import { transformAppearance } from './cad-appearance';

export interface SelectSameFields { type: boolean; fill: boolean; outline: boolean; opacity: boolean }
export type SelectSameError = 'sourceRequired' | 'fieldsRequired' | 'unsupported' | 'pickRequired' | 'changed' | 'noMatches' | 'failed';
export interface SelectSamePlan { revision: string; source: TLShapeId; fields: SelectSameFields; ids: TLShapeId[]; inspected: number }
export type SelectSameResult<T> = { ok: true; value: T } | { ok: false; error: SelectSameError };
const native = new Set(['geo', 'draw', 'highlight', 'line', 'arrow', 'text']);
const cad = new Set(['cad-bezier', 'cad-path', 'cad-ellipse', 'cad-arc']);
const keys = ['type', 'fill', 'outline', 'opacity'] as const;

/** Compare plain style definitions independent of JSON property insertion order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : value;
}
function signature(value: unknown): string { return JSON.stringify(canonical(value)); }

/** Production cards, embedded forms, frames and their contents are excluded.
 * Group children are ordinary artwork and may be selected individually. */
function artwork(editor: Editor, shape: TLShape): boolean {
  if (!native.has(shape.type) && !cad.has(shape.type) && shape.type !== 'image') return false;
  const seen = new Set<string>([shape.id]);
  let parentId = shape.parentId;
  while (parentId !== editor.getCurrentPageId()) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = editor.getShape(parentId as TLShapeId);
    if (!parent || parent.type !== 'group') return false;
    parentId = parent.parentId;
  }
  return true;
}

function attributes(shape: TLShape): Record<keyof SelectSameFields, string | null> {
  const props = shape.props as Record<string, unknown>;
  const result: Record<keyof SelectSameFields, string | null> = {
    type: signature(shape.type === 'geo' ? ['geo', props.geo] : shape.type),
    fill: null, outline: null,
    opacity: Number.isFinite(shape.opacity) && shape.opacity >= 0 && shape.opacity <= 1 ? signature(shape.opacity) : null,
  };
  if (native.has(shape.type)) {
    // Native color is one shared style for fill and outline. Keep native
    // tokens separate from CAD paint; no visual color approximation is made.
    if (typeof props.color === 'string') {
      const fill = shape.type === 'text' ? 'solid' : typeof props.fill === 'string' ? props.fill : 'none';
      const visibleFill = fill !== 'none' && !(shape.type === 'draw' && props.isClosed === false);
      result.fill = signature(visibleFill ? { family: 'native', color: props.color, fill } : { family: 'native', fill: 'none' });
      if (shape.type !== 'text') result.outline = signature({ family: 'native', color: props.color,
        dash: props.dash ?? null, size: props.size ?? null,
        arrowheadStart: props.arrowheadStart ?? null, arrowheadEnd: props.arrowheadEnd ?? null });
    }
  } else if (cad.has(shape.type)) {
    if (shape.meta.omsVectorPaint && !validVectorPaint(shape.meta.omsVectorPaint)) return result;
    const paint = cadShapePaint(shape);
    const filled = paint.fillOpacity > 0 && (paint.fill !== 'none' || !!paint.gradient || !!paint.raster);
    if (!filled) result.fill = signature({ family: 'cad', fill: 'none' });
    else {
      try {
        let appearance = { gradient: paint.gradient, raster: paint.raster };
        if (paint.gradient || paint.raster) {
          const { bounds: b } = cadAppearanceGeometry(shape);
          if (!(b.w > 0 && b.h > 0)) throw new Error('bounds');
          appearance = transformAppearance(appearance, [1 / b.w, 0, 0, 1 / b.h, -b.x / b.w, -b.y / b.h]);
          // Normalize only affine-fit noise, preserving original paint values.
          if (appearance.gradient) appearance.gradient = { ...appearance.gradient,
            matrix: appearance.gradient.matrix.map(n => Number(n.toPrecision(12))) as typeof appearance.gradient.matrix };
          if (appearance.raster) appearance.raster = { ...appearance.raster,
            matrix: appearance.raster.matrix.map(n => Number(n.toPrecision(12))) as typeof appearance.raster.matrix };
        }
        result.fill = signature({ family: 'cad', fill: paint.gradient || paint.raster ? null : paint.fill,
          opacity: paint.fillOpacity, gradient: appearance.gradient ?? null, raster: appearance.raster ?? null });
      } catch { /* Invalid fill bounds do not invalidate type, outline or opacity. */ }
    }
    result.outline = signature(paint.stroke === 'none' || paint.strokeWidth === 0 || paint.strokeOpacity === 0
      ? { family: 'cad', outline: 'none' }
      : { family: 'cad', color: paint.stroke, width: paint.strokeWidth,
        opacity: paint.strokeOpacity, cap: paint.lineCap, join: paint.lineJoin, miter: paint.miterLimit,
        dash: paint.dash, offset: paint.dashOffset });
  }
  return result;
}

/** Selection changes are intentional while a reference preview is retained.
 * Document, source paint and page changes always invalidate the preview. */
export function selectSameRevision(editor: Editor): string {
  return JSON.stringify([editor.getCurrentPageId(), editor.getCurrentPageShapesSorted()]);
}

function referenceFor(editor: Editor, fields: SelectSameFields, referenceId?: TLShapeId): SelectSameResult<{
  source: TLShape; values: ReturnType<typeof attributes>; chosen: (keyof SelectSameFields)[];
}> {
  try {
    if (!fields || keys.some(key => typeof fields[key] !== 'boolean') || !keys.some(key => fields[key]))
      return { ok: false, error: 'fieldsRequired' };
    const selected = editor.getSelectedShapeIds();
    const source = referenceId ? editor.getShape(referenceId) : selected.length === 1 ? editor.getShape(selected[0]) : undefined;
    if (!source || !artwork(editor, source)) return { ok: false, error: 'sourceRequired' };
    // Do not finish a live drawing gesture merely to change selection.
    if (!editor.getInstanceState().isReadonly && !editor.isIn('select.idle')) return { ok: false, error: 'pickRequired' };
    const values = attributes(source), chosen = keys.filter(key => fields[key]);
    if (chosen.some(key => values[key] === null)) return { ok: false, error: 'unsupported' };
    return { ok: true, value: { source, values, chosen } };
  } catch { return { ok: false, error: 'failed' }; }
}

/** Checking a button's availability must not rescan the whole drawing. */
export function inspectSelectSameReference(editor: Editor, fields: SelectSameFields): SelectSameResult<true> {
  const result = referenceFor(editor, fields);
  return result.ok ? { ok: true, value: true } : { ok: false, error: result.error };
}

export function prepareSelectSame(editor: Editor, fields: SelectSameFields, referenceId?: TLShapeId): SelectSameResult<SelectSamePlan> {
  try {
    const inspected = referenceFor(editor, fields, referenceId);
    if (!inspected.ok) return { ok: false, error: inspected.error };
    const { source, values: reference, chosen } = inspected.value;
    const candidates = editor.getCurrentPageShapesSorted().filter(shape => artwork(editor, shape));
    const ids = candidates.filter(shape => {
      const values = attributes(shape);
      return chosen.every(key => values[key] !== null && values[key] === reference[key]);
    }).map(shape => shape.id);
    if (!ids.length) return { ok: false, error: 'noMatches' };
    return { ok: true, value: { revision: selectSameRevision(editor), source: source.id,
      fields: { ...fields }, ids, inspected: candidates.length } };
  } catch { return { ok: false, error: 'failed' }; }
}

/** Only the selection changes; no document records, history marks or tools.
 * Recompute from the reviewed source instead of trusting cached result ids. */
export function applySelectSame(editor: Editor, plan: SelectSamePlan, mode: 'replace' | 'add'): SelectSameResult<number> {
  const before = [...editor.getSelectedShapeIds()];
  try {
    if (!['replace', 'add'].includes(mode)) return { ok: false, error: 'failed' };
    if (plan.revision !== selectSameRevision(editor)) return { ok: false, error: 'changed' };
    const refreshed = prepareSelectSame(editor, plan.fields, plan.source);
    if (!refreshed.ok) return refreshed;
    const ids = mode === 'add' ? [...new Set([...before, ...refreshed.value.ids])] : refreshed.value.ids;
    editor.setSelectedShapes(ids);
    const actual = editor.getSelectedShapeIds();
    if (actual.length !== ids.length || !ids.every(id => actual.includes(id))) throw new Error('selection');
    return { ok: true, value: ids.length };
  } catch {
    try { editor.setSelectedShapes(before); } catch { /* No artwork is changed if selection API is unavailable. */ }
    return { ok: false, error: 'failed' };
  }
}
