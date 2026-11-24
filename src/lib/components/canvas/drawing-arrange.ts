import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { getCadShapePageBounds } from './cad-bounds';
import { CAD_PROJECTION_LIMIT, getCadShapePageProjection, type CadProjectionRange } from './cad-projected-bounds';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { validCadPoint, canvasLengthToUnit, unitLengthToCanvas, type CadSettings, type CadPoint } from './cad-settings';
import { drawingTransaction } from './drawing-commands';
import { drawingPageBounds } from './drawing-pages';

export type ArrangeOptions =
  | { kind: 'align'; axis: 'x' | 'y'; alignment: 'start' | 'center' | 'end'; reference: 'selection' | 'last' | 'page' | TLShapeId | { position: number; together?: boolean }; together?: boolean }
  | { kind: 'align-guide'; point: CadPoint; normal: CadPoint; alignment?: 'start' | 'center' | 'end'; together?: boolean }
  | { kind: 'distribute'; axis: 'x' | 'y'; mode: 'centers' | 'gaps' }
  | { kind: 'space'; axis: 'x' | 'y'; gap: number; anchor: 'start' | 'end' | TLShapeId };
interface Item { id: TLShapeId; bounds: Box; leaves: Array<{ id: TLShapeId; bounds: Box; rotation: number }> }
export interface ArrangePlan {
  revision: string;
  options: ArrangeOptions;
  selected: TLShapeId[];
  moved: number;
  gap?: number;
  placements: Array<{ id: TLShapeId; delta: CadPoint }>;
}
const TYPES = new Set(['group', 'geo', 'draw', 'highlight', 'line', 'text', 'image', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc', 'cad-dimension']);
export const MAX_ARRANGE_GAP = 100_000;
/** Accept the displayed maximum despite conversion roundoff, without accepting
 * a value above it or relaxing the geometry engine's coordinate limit. */
export function arrangeGapFromDisplay(value: number, settings: CadSettings | null): number | undefined {
  const max = settings ? canvasLengthToUnit(MAX_ARRANGE_GAP, settings) : MAX_ARRANGE_GAP;
  if (!Number.isFinite(value) || value < 0 || value > max) return undefined;
  const canvas = settings ? unitLengthToCanvas(value, settings) : value;
  return Number.isFinite(canvas) ? Math.min(MAX_ARRANGE_GAP, canvas) : undefined;
}
const EPSILON = 1e-7;

/** A selected group is one item, even if a descendant is also selected. */
export function arrangementRoots(editor: Editor): TLShapeId[] {
  const selected = new Set(editor.getSelectedShapeIds());
  return [...selected].filter(id => {
    let shape = editor.getShape(id); const seen = new Set<string>();
    while (shape && !seen.has(shape.id)) {
      seen.add(shape.id);
      if (selected.has(shape.parentId as TLShapeId)) return false;
      shape = editor.getShape(shape.parentId as TLShapeId);
    }
    return true;
  });
}
const validBounds = (b: Box | undefined): b is Box => !!b && b.w >= 0 && b.h >= 0 &&
  validCadPoint({ x: b.x, y: b.y }) && validCadPoint({ x: b.maxX, y: b.maxY });
function selection(editor: Editor, minimum = 2): Item[] {
  const roots = arrangementRoots(editor);
  if (roots.length < minimum || roots.length > 500) throw new CadOperationError('arrangeSelection');
  try { assertCadEditable(editor, roots); } catch { throw new CadOperationError('arrangeProtected'); }
  return roots.map(id => {
    const members = [...editor.getShapeAndDescendantIds([id])].map(id => editor.getShape(id));
    if (members.some(s => !s || !TYPES.has(s.type))) throw new CadOperationError('arrangeProtected');
    for (const shape of members as TLShape[]) {
      if (editor.getShapeMask(shape.id) || (shape.meta.omsVectorPaint as any)?.clips?.length || editor.getBindingsInvolvingShape(shape.id).length)
        throw new CadOperationError('arrangeUnsupported');
      // Even a currently unclipped frame child can become clipped after moving.
      // Production pockets and forms must not participate in artwork arrangement.
      let parent = editor.getShape(shape.parentId as TLShapeId); const seen = new Set<string>();
      while (parent && !seen.has(parent.id)) {
        if (parent.type !== 'group') throw new CadOperationError('arrangeUnsupported');
        seen.add(parent.id); parent = editor.getShape(parent.parentId as TLShapeId);
      }
    }
    const leaves = (members as TLShape[]).filter(s => s.type !== 'group').map(s => {
      const bounds = getCadShapePageBounds(editor, s);
      if (!validBounds(bounds)) throw new CadOperationError('arrangeBounds');
      return { id: s.id, bounds, rotation: editor.getShapePageTransform(s).rotation() };
    });
    if (!leaves.length) throw new CadOperationError('arrangeBounds');
    return { id, leaves, bounds: Box.Common(leaves.map(s => s.bounds)) };
  });
}
const position = (b: Box, axis: 'x' | 'y', alignment: 'start' | 'center' | 'end') =>
  b[axis] + (axis === 'x' ? b.w : b.h) * (alignment === 'center' ? 0.5 : alignment === 'end' ? 1 : 0);
const commonProjection = (ranges: CadProjectionRange[]): CadProjectionRange => ({
  min: Math.min(...ranges.map(range => range.min)), max: Math.max(...ranges.map(range => range.max)),
});
function guideProjections(editor: Editor, items: Item[], unit: CadPoint) {
  const budget = { remaining: CAD_PROJECTION_LIMIT }, ranges = new Map<TLShapeId, CadProjectionRange>();
  for (const item of items) {
    let min = Infinity, max = -Infinity;
    for (const leaf of item.leaves) {
      const shape = editor.getShape(leaf.id), range = shape && getCadShapePageProjection(editor, shape, unit, budget);
      if (!range) throw new CadOperationError('arrangeGuideGeometry');
      min = Math.min(min, range.min); max = Math.max(max, range.max);
    }
    ranges.set(item.id, { min, max });
  }
  return ranges;
}
function guideAxisBounds(editor: Editor, items: Item[]) {
  const x = guideProjections(editor, items, { x: 1, y: 0 }), y = guideProjections(editor, items, { x: 0, y: 1 });
  return new Map(items.map(item => {
    const horizontal = x.get(item.id)!, vertical = y.get(item.id)!;
    return [item.id, new Box(horizontal.min, vertical.min, horizontal.max - horizontal.min, vertical.max - vertical.min)];
  }));
}

/** Axis layout uses page-axis bounds. Angled edges use exact geometry support
 * perpendicular to the guide. Both exclude outline thickness. Sorting ties by
 * stable shape ID keeps coincident items independent of selection order. */
export function prepareArrangePlan(editor: Editor, options: ArrangeOptions): ArrangePlan {
  if (!options || !['align', 'align-guide', 'distribute', 'space'].includes(options.kind) ||
      options.kind !== 'align-guide' && !['x', 'y'].includes(options.axis)) throw new CadOperationError('arrangeFailed');
  const coordinateReference = options.kind === 'align-guide' || options.kind === 'align' && (typeof options.reference === 'object' || options.reference === 'page');
  const items = selection(editor, coordinateReference ? 1 : 2), axis = options.kind === 'align-guide' ? 'x' : options.axis, size = axis === 'x' ? 'w' : 'h';
  const targets = new Map<TLShapeId, number>();
  const guideDeltas = new Map<TLShapeId, CadPoint>();
  let gap: number | undefined;
  if (options.kind === 'align-guide') {
    const { point, normal } = options;
    const alignment = options.alignment ?? 'center';
    if (!['start', 'center', 'end'].includes(alignment)) throw new CadOperationError('arrangeFailed');
    const length = normal && Math.hypot(normal.x, normal.y);
    if (!point || !validCadPoint(point) || !Number.isFinite(length) || length < EPSILON ||
        options.together !== undefined && typeof options.together !== 'boolean') throw new CadOperationError('arrangeBounds');
    const unit = { x: normal.x / length, y: normal.y / length }, common = Box.Common(items.map(item => item.bounds));
    if (alignment === 'center') {
      // Retain the established page-bounds-center behavior for existing plans.
      for (const item of items) {
        const center = (options.together === false ? item.bounds : common).center;
        const distance = (point.x - center.x) * unit.x + (point.y - center.y) * unit.y;
        guideDeltas.set(item.id, { x: distance * unit.x, y: distance * unit.y });
      }
    } else {
      const ranges = guideProjections(editor, items, unit), range = commonProjection([...ranges.values()]);
      for (const item of items) {
        const support = options.together === false ? ranges.get(item.id)! : range;
        const distance = point.x * unit.x + point.y * unit.y - (alignment === 'start' ? support.min : support.max);
        guideDeltas.set(item.id, { x: distance * unit.x, y: distance * unit.y });
      }
    }
  } else if (options.kind === 'align') {
    if (!['start', 'center', 'end'].includes(options.alignment)) throw new CadOperationError('arrangeFailed');
    if (typeof options.reference === 'object' || options.reference === 'page') {
      const page = options.reference === 'page' ? drawingPageBounds(editor) : null;
      if (options.reference === 'page' && !page) throw new CadOperationError('arrangePage');
      const reference = typeof options.reference === 'object' ? options.reference
        : { position: position(page!, axis, options.alignment), together: options.together };
      if (!reference || !validCadPoint({ x: axis === 'x' ? reference.position : 0, y: axis === 'y' ? reference.position : 0 }) ||
          reference.together !== undefined && typeof reference.together !== 'boolean') throw new CadOperationError('arrangeBounds');
      // A guide can move the selection as one motif, preserving the spacing
      // between roots, or align each root independently when explicitly chosen.
      const common = Box.Common(items.map(item => item.bounds));
      for (const item of items) targets.set(item.id, item.bounds[axis] + reference.position -
        position(reference.together === false ? item.bounds : common, axis, options.alignment));
    } else {
      const reference = options.reference === 'selection' ? Box.Common(items.map(i => i.bounds))
        : options.reference === 'last' ? items.at(-1)!.bounds : items.find(i => i.id === options.reference)?.bounds;
      if (!reference) throw new CadOperationError('arrangeSelection');
      const target = position(reference, axis, options.alignment);
      for (const item of items) targets.set(item.id, item.bounds[axis] + target - position(item.bounds, axis, options.alignment));
    }
  } else {
    if (options.kind === 'distribute' && (items.length < 3 || !['centers', 'gaps'].includes(options.mode))) throw new CadOperationError('arrangeSelection');
    const by = options.kind === 'distribute' && options.mode === 'centers' ? 'center' : 'start';
    const sorted = [...items].sort((a, b) => position(a.bounds, axis, by) - position(b.bounds, axis, by) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const first = sorted[0], last = sorted.at(-1)!;
    if (options.kind === 'distribute' && options.mode === 'centers') {
      const start = position(first.bounds, axis, 'center'), end = position(last.bounds, axis, 'center');
      for (const [i, item] of sorted.entries()) targets.set(item.id, start + (end - start) * i / (sorted.length - 1) - item.bounds[size] / 2);
    } else {
      let anchor = 0;
      if (options.kind === 'space') {
        if (!Number.isFinite(options.gap) || options.gap < 0 || options.gap > MAX_ARRANGE_GAP) throw new CadOperationError('arrangeGap');
        gap = options.gap;
        anchor = options.anchor === 'start' ? 0 : options.anchor === 'end' ? sorted.length - 1 : sorted.findIndex(i => i.id === options.anchor);
        if (anchor < 0) throw new CadOperationError('arrangeSelection');
      } else {
        gap = (position(last.bounds, axis, 'end') - first.bounds[axis] - sorted.reduce((sum, i) => sum + i.bounds[size], 0)) / (sorted.length - 1);
        // Equal gaps must fit within the fixed outside objects. Do not silently
        // create overlap when wider interior objects consume the available span.
        if (gap < -EPSILON) throw new CadOperationError('arrangeOverlap');
        gap = Math.max(0, gap);
      }
      targets.set(sorted[anchor].id, sorted[anchor].bounds[axis]);
      for (let i = anchor + 1; i < sorted.length; i++) targets.set(sorted[i].id, targets.get(sorted[i-1].id)! + sorted[i-1].bounds[size] + gap);
      for (let i = anchor - 1; i >= 0; i--) targets.set(sorted[i].id, targets.get(sorted[i+1].id)! - gap - sorted[i].bounds[size]);
    }
  }
  // Native cubic hit-test bounds can miss a small interior extremum. Exact
  // edge plans must also stay inside the page-coordinate envelope in X and Y.
  const edgeBounds = options.kind === 'align-guide' && (options.alignment === 'start' || options.alignment === 'end')
    ? guideAxisBounds(editor, items) : null;
  const placements = items.map(item => {
    const delta = options.kind === 'align-guide' ? guideDeltas.get(item.id)! : { x: 0, y: 0 };
    if (options.kind !== 'align-guide') delta[axis] = targets.get(item.id)! - item.bounds[axis];
    const shape = editor.getShape(item.id)!, origin = editor.getShapePageTransform(shape).point();
    const target = { x: origin.x + delta.x, y: origin.y + delta.y };
    if (!validCadPoint(target) || !validCadPoint(editor.getPointInParentSpace(shape, target)) ||
        !validCadPoint({ x: item.bounds.x + delta.x, y: item.bounds.y + delta.y }) ||
        !validCadPoint({ x: item.bounds.maxX + delta.x, y: item.bounds.maxY + delta.y })) throw new CadOperationError('arrangeBounds');
    const exact = edgeBounds?.get(item.id);
    if (exact && (!validCadPoint({ x: exact.x + delta.x, y: exact.y + delta.y }) ||
        !validCadPoint({ x: exact.maxX + delta.x, y: exact.maxY + delta.y }))) throw new CadOperationError('arrangeBounds');
    return { id: item.id, delta };
  });
  return { revision: cadRevision(editor), selected: [...editor.getSelectedShapeIds()], options: structuredClone(options), gap,
    placements, moved: placements.filter(p => Math.hypot(p.delta.x, p.delta.y) > EPSILON).length };
}

/** Recompute after finishing gestures, and verify page-space geometry after
 * native updates. Refused/adjusted or partly applied moves roll back together. */
export function applyArrangePlan(editor: Editor, plan: ArrangePlan): boolean {
  try {
    if (plan.revision !== cadRevision(editor)) return false;
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision !== cadRevision(editor)) return false;
    const fresh = prepareArrangePlan(editor, plan.options), items = selection(editor,
      plan.options.kind === 'align-guide' || plan.options.kind === 'align' && (typeof plan.options.reference === 'object' || plan.options.reference === 'page') ? 1 : 2);
    if (!fresh.moved) return true;
    const updates = fresh.placements.map(({ id, delta }) => {
      const shape = editor.getShape(id)!, origin = editor.getShapePageTransform(shape).point();
      const local = editor.getPointInParentSpace(shape, { x: origin.x + delta.x, y: origin.y + delta.y });
      return { id, type: shape.type, x: local.x, y: local.y };
    }).filter((_, i) => Math.hypot(fresh.placements[i].delta.x, fresh.placements[i].delta.y) > EPSILON);
    return drawingTransaction(editor, () => {
      editor.updateShapes(updates);
      for (const item of items) {
        const delta = fresh.placements.find(p => p.id === item.id)!.delta;
        for (const leaf of item.leaves) {
          const shape = editor.getShape(leaf.id), bounds = shape && getCadShapePageBounds(editor, shape);
          if (!validBounds(bounds) || Math.abs(bounds.x - leaf.bounds.x - delta.x) > 1e-6 || Math.abs(bounds.y - leaf.bounds.y - delta.y) > 1e-6 ||
              Math.abs(bounds.w - leaf.bounds.w) > 1e-6 || Math.abs(bounds.h - leaf.bounds.h) > 1e-6 ||
              Math.abs(Math.sin((editor.getShapePageTransform(shape!).rotation() - leaf.rotation) / 2)) > 1e-8)
            throw new CadOperationError('arrangeFailed');
        }
      }
      const options = fresh.options;
      if (options.kind === 'align-guide' && (options.alignment === 'start' || options.alignment === 'end')) {
        if ([...guideAxisBounds(editor, items).values()].some(bounds => !validBounds(bounds)))
          throw new CadOperationError('arrangeBounds');
        const length = Math.hypot(options.normal.x, options.normal.y), unit = { x: options.normal.x / length, y: options.normal.y / length };
        const ranges = [...guideProjections(editor, items, unit).values()];
        const support = options.together === false ? ranges : [commonProjection(ranges)];
        const target = options.point.x * unit.x + options.point.y * unit.y;
        if (support.some(range => Math.abs((options.alignment === 'start' ? range.min : range.max) - target) > 1e-6))
          throw new CadOperationError('arrangeFailed');
      }
      if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new CadOperationError('arrangeBounds');
    });
  } catch { return false; }
}
