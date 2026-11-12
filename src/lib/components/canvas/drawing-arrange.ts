import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { getCadShapePageBounds } from './cad-bounds';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { validCadPoint, canvasLengthToUnit, unitLengthToCanvas, type CadSettings, type CadPoint } from './cad-settings';
import { drawingTransaction } from './drawing-commands';

export type ArrangeOptions =
  | { kind: 'align'; axis: 'x' | 'y'; alignment: 'start' | 'center' | 'end'; reference: 'selection' | TLShapeId }
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
function selection(editor: Editor): Item[] {
  const roots = arrangementRoots(editor);
  if (roots.length < 2 || roots.length > 500) throw new CadOperationError('arrangeSelection');
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

/** Layout uses page-axis geometry bounds, excluding outline thickness. Sorting
 * ties by stable shape ID keeps coincident items independent of selection order. */
export function prepareArrangePlan(editor: Editor, options: ArrangeOptions): ArrangePlan {
  if (!options || !['x', 'y'].includes(options.axis) || !['align', 'distribute', 'space'].includes(options.kind)) throw new CadOperationError('arrangeFailed');
  const items = selection(editor), { axis } = options, size = axis === 'x' ? 'w' : 'h';
  const targets = new Map<TLShapeId, number>();
  let gap: number | undefined;
  if (options.kind === 'align') {
    if (!['start', 'center', 'end'].includes(options.alignment)) throw new CadOperationError('arrangeFailed');
    const reference = options.reference === 'selection' ? Box.Common(items.map(i => i.bounds)) : items.find(i => i.id === options.reference)?.bounds;
    if (!reference) throw new CadOperationError('arrangeSelection');
    const target = position(reference, axis, options.alignment);
    for (const item of items) targets.set(item.id, item.bounds[axis] + target - position(item.bounds, axis, options.alignment));
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
  const placements = items.map(item => {
    const delta = { x: 0, y: 0 }; delta[axis] = targets.get(item.id)! - item.bounds[axis];
    const shape = editor.getShape(item.id)!, origin = editor.getShapePageTransform(shape).point();
    const target = { x: origin.x + delta.x, y: origin.y + delta.y };
    if (!validCadPoint(target) || !validCadPoint(editor.getPointInParentSpace(shape, target)) ||
        !validCadPoint({ x: item.bounds.x + delta.x, y: item.bounds.y + delta.y }) ||
        !validCadPoint({ x: item.bounds.maxX + delta.x, y: item.bounds.maxY + delta.y })) throw new CadOperationError('arrangeBounds');
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
    const fresh = prepareArrangePlan(editor, plan.options), items = selection(editor);
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
      if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new CadOperationError('arrangeBounds');
    });
  } catch { return false; }
}
