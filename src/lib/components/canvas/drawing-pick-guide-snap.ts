import { atom, Box, react, type Editor, type TLEventInfo, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { arrangementRoots } from './drawing-arrange';
import { getCadShapePageBounds } from './cad-bounds';
import { assertCadEditable } from './cad-plans';
import { isCadNodeEditing } from './cad-node-selection';
import { validCadPoint, type CadPoint } from './cad-settings';
import { readCadSnapSettings } from './cad-snap-settings';
import { drawingGuideLine, drawingGuidesAreValid, drawingGuidesRevision, readDrawingGuides, type DrawingGuide, type DrawingGuideGeometry } from './drawing-guides';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';

export type PickGuideAnchor = 'start' | 'center' | 'end';
export interface DrawingPickGuideSnap {
  guides: Array<DrawingGuideGeometry & { id: string; anchor: PickGuideAnchor }>;
  /** One page-space correction shared by every moving selection root. */
  delta: CadPoint;
}
const indicators = new WeakMap<Editor, ReturnType<typeof atom<DrawingPickGuideSnap | null>>>();
export function drawingPickGuideSnap(editor: Editor) {
  let value = indicators.get(editor);
  if (!value) { value = atom<DrawingPickGuideSnap | null>('Pick guideline snapping', null); indicators.set(editor, value); }
  return value;
}

export const MAX_PICK_GUIDE_ROOTS = 100;
export const MAX_PICK_GUIDE_SHAPES = 500;
const EPS = 1e-6;
const TYPES = new Set(['group', 'geo', 'draw', 'highlight', 'line', 'text', 'image', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc', 'cad-dimension']);
type Root = { shape: TLShape; point: CadPoint };
interface Snapshot {
  roots: Map<TLShapeId, Root>;
  members: Set<TLShapeId>;
  ancestors: Set<TLShapeId>;
  bounds: Box;
  average: CadPoint;
  cache?: { key: string; result: DrawingPickGuideSnap | null };
}
interface Gesture {
  pageId: string;
  revision: string;
  guides: DrawingGuide[];
  snapshots: Map<string, Snapshot>;
  created: Set<TLShapeId>;
  invalid: boolean;
  translated: boolean;
  nativeAxes: Set<'x' | 'y'>;
}
const selectedKey = (editor: Editor) => JSON.stringify([...editor.getSelectedShapeIds()].sort());
const samePoint = (a: CadPoint, b: CadPoint) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
const coordinateOnly = (a: TLShape, b: TLShape) => a.type === b.type && a.parentId === b.parentId && a.index === b.index &&
  a.rotation === b.rotation && a.opacity === b.opacity && a.isLocked === b.isLocked && a.props === b.props && a.meta === b.meta;
const validBounds = (b: Box | undefined): b is Box => !!b && b.w >= 0 && b.h >= 0 &&
  validCadPoint({ x: b.x, y: b.y }) && validCadPoint({ x: b.maxX, y: b.maxY });

function snapshot(editor: Editor): Snapshot | null {
  try {
    const ids = arrangementRoots(editor);
    // Native Translating moves the selected IDs. Overlapping selected ancestors
    // and descendants cannot safely receive an additional common correction.
    if (!ids.length || ids.length > MAX_PICK_GUIDE_ROOTS || ids.length !== editor.getSelectedShapeIds().length) return null;
    assertCadEditable(editor, ids);
    const members = editor.getShapeAndDescendantIds(ids);
    if (members.size > MAX_PICK_GUIDE_SHAPES) return null;
    const ancestors = new Set<TLShapeId>(), boxes: Box[] = [], roots = new Map<TLShapeId, Root>();
    for (const id of members) {
      const shape = editor.getShape(id);
      if (!shape || !TYPES.has(shape.type) || editor.getShapeMask(id) || (shape.meta.omsVectorPaint as any)?.clips?.length || editor.getBindingsInvolvingShape(id).length) return null;
      let parent = editor.getShape(shape.parentId as TLShapeId); const seen = new Set<TLShapeId>([id]);
      while (parent) {
        if (seen.has(parent.id) || parent.type !== 'group' || editor.getBindingsInvolvingShape(parent.id).length) return null;
        seen.add(parent.id);
        if (!members.has(parent.id)) ancestors.add(parent.id);
        parent = editor.getShape(parent.parentId as TLShapeId);
      }
      if (shape.type !== 'group') { const box = getCadShapePageBounds(editor, shape); if (!validBounds(box)) return null; boxes.push(box); }
    }
    if (!boxes.length) return null;
    let x = 0, y = 0;
    for (const id of ids) {
      const shape = editor.getShape(id)!, point = editor.getShapePageTransform(shape).point();
      if (!validCadPoint(point)) return null;
      roots.set(id, { shape, point: { x: point.x, y: point.y } }); x += point.x; y += point.y;
    }
    return { roots, members, ancestors, bounds: Box.Common(boxes), average: { x: x / ids.length, y: y / ids.length } };
  } catch { return null; }
}

/** The same public input displacement and optional grid used by native 2.4.6
 * Translating. We only accept records matching this result. Native object
 * nudges, utility-specific translation changes and history restores pass through. */
function nativeDisplacement(editor: Editor, source: Snapshot): { delta: CadPoint; locked: 'x' | 'y' | null } | null {
  const inputs = editor.inputs;
  const delta = { x: inputs.currentPagePoint.x - inputs.originPagePoint.x, y: inputs.currentPagePoint.y - inputs.originPagePoint.y };
  if (!validCadPoint(delta)) return null;
  const locked = inputs.shiftKey ? Math.abs(delta.x) < Math.abs(delta.y) ? 'x' : 'y' : null;
  if (locked) delta[locked] = 0;
  if (editor.getInstanceState().isGridMode && !inputs.ctrlKey) {
    const grid = editor.getDocumentSettings().gridSize;
    if (!Number.isFinite(grid) || grid <= 0) return null;
    delta.x = Math.round((source.average.x + delta.x) / grid) * grid - source.average.x;
    delta.y = Math.round((source.average.y + delta.y) / grid) * grid - source.average.y;
  }
  return { delta, locked };
}

/** Edges and center of the entire selection use one delta, so multiple roots
 * retain their spacing. Hidden and locked guides have the existing eligibility. */
function guideCorrection(editor: Editor, source: Snapshot, guides: DrawingGuide[], delta: CadPoint, blocked: ReadonlySet<'x' | 'y'>, tolerance: number): DrawingPickGuideSnap | null {
  const correction: DrawingPickGuideSnap = { guides: [], delta: { x: 0, y: 0 } };
  for (const axis of ['x', 'y'] as const) {
    if (blocked.has(axis)) continue;
    const start = source.bounds[axis] + delta[axis], size = axis === 'x' ? source.bounds.w : source.bounds.h;
    let nearest = tolerance, match: DrawingPickGuideSnap['guides'][number] | undefined;
    for (const guide of guides) {
      if (guide.axis !== axis) continue;
      for (const [anchor, ratio] of [['center', .5], ['start', 0], ['end', 1]] as const) {
        const distance = guide.position - start - ratio * size;
        if (Math.abs(distance) <= nearest && (!match || Math.abs(distance) < nearest - 1e-10)) {
          nearest = Math.abs(distance); correction.delta[axis] = distance;
          match = { id: guide.id, axis, position: guide.position, anchor };
        }
      }
    }
    if (match) correction.guides.push(match);
  }
  const canX = !blocked.has('x') && !correction.guides.some(guide => guide.axis === 'x');
  const canY = !blocked.has('y') && !correction.guides.some(guide => guide.axis === 'y');
  if (canX || canY) {
    const base = { x: source.bounds.x + delta.x + correction.delta.x, y: source.bounds.y + delta.y + correction.delta.y };
    const anchors = [
      [.5, .5, 'center'], [0, 0, 'start'], [1, 0, 'end'], [0, 1, 'start'], [1, 1, 'end'],
      [.5, 0, 'center'], [.5, 1, 'center'], [0, .5, 'start'], [1, .5, 'end'],
    ] as const;
    let winner: { guide: DrawingPickGuideSnap['guides'][number]; delta: CadPoint } | undefined;
    let nearest = tolerance;
    for (const guide of guides) {
      if (guide.axis !== 'angle') continue;
      const { point, normal } = drawingGuideLine(guide);
      const nx = canX ? normal.x : 0, ny = canY ? normal.y : 0, weight = nx * nx + ny * ny;
      if (weight < 1e-10) continue;
      for (const [rx, ry, anchor] of anchors) {
        const x = base.x + rx * source.bounds.w, y = base.y + ry * source.bounds.h;
        const normalOffset = ((point.x - x) * normal.x + (point.y - y) * normal.y) / weight;
        const move = { x: nx * normalOffset, y: ny * normalOffset }, distance = Math.hypot(move.x, move.y);
        if (distance <= nearest && (!winner || distance < nearest - 1e-10)) {
          nearest = distance;
          winner = { guide: { id: guide.id, axis: guide.axis, angle: guide.angle, pivot: guide.pivot, anchor }, delta: move };
        }
      }
    }
    if (winner) {
      correction.guides.push(winner.guide);
      correction.delta.x += winner.delta.x; correction.delta.y += winner.delta.y;
    }
  }
  if (!correction.guides.length) return null;
  const dx = delta.x + correction.delta.x, dy = delta.y + correction.delta.y;
  if (!validCadPoint({ x: source.bounds.x + dx, y: source.bounds.y + dy }) || !validCadPoint({ x: source.bounds.maxX + dx, y: source.bounds.maxY + dy })) return null;
  for (const root of source.roots.values()) {
    const page = { x: root.point.x + dx, y: root.point.y + dy };
    if (!validCadPoint(page) || !validCadPoint(editor.getPointInParentSpace(root.shape, page))) return null;
  }
  return correction;
}

/** Native indicators are public output, not injected targets. Their aligned
 * axis remains authoritative while the other axis can acquire a guideline. */
function nativeSnapAxes(editor: Editor): Set<'x' | 'y'> {
  const axes = new Set<'x' | 'y'>();
  for (const indicator of editor.snaps.getIndicators()) {
    if (indicator.type === 'gaps') { axes.add(indicator.direction === 'horizontal' ? 'x' : 'y'); continue; }
    const points = indicator.points;
    if (points.length < 2) { axes.add('x'); axes.add('y'); continue; }
    const x = points.every(p => Math.abs(p.x - points[0].x) <= EPS), y = points.every(p => Math.abs(p.y - points[0].y) <= EPS);
    if (x) axes.add('x'); if (y) axes.add('y');
    if (!x && !y) { axes.add('x'); axes.add('y'); }
  }
  return axes;
}

/** Adds guideline targets to ordinary native Pick translation through public
 * side effects. It neither starts a tool nor creates history marks/shape records.
 * Native pointer-up, Escape, Alt duplication and undo keep their own lifecycle. */
export function installDrawingPickGuideSnapping(editor: Editor): () => void {
  let gesture: Gesture | null = null, applying = false;
  const indicator = drawingPickGuideSnap(editor);
  const clear = () => { gesture = null; indicator.set(null); };
  const invalidate = () => { if (gesture) gesture.invalid = true; indicator.set(null); };
  const event = (info: TLEventInfo) => {
    if (info.type === 'pointer' && info.name === 'pointer_down' && info.button === 0) {
      clear();
      if (editor.getCurrentToolId() !== 'select' || !['select.pointing_shape', 'select.pointing_selection'].includes(editor.getPath()) ||
          editor.getInstanceState().isReadonly || isCadNodeEditing(editor) || isDrawingPointerGestureActive(editor) || !drawingGuidesAreValid(editor)) return;
      const source = snapshot(editor), guides = readDrawingGuides(editor).guides;
      if (!source || !guides.length) return;
      gesture = { pageId: editor.getCurrentPageId(), revision: drawingGuidesRevision(editor), guides,
        snapshots: new Map([[selectedKey(editor), source]]), created: new Set(), invalid: false, translated: false, nativeAxes: new Set() };
    }
    if (gesture && editor.isIn('select.translating')) {
      gesture.translated = true; gesture.nativeAxes = nativeSnapAxes(editor); reconcile();
    } else if (!['select.pointing_shape', 'select.pointing_selection'].includes(editor.getPath())) {
      if (gesture?.translated) reconcile(true); else clear();
    }
  };
  editor.on('event', event);
  const beforeCreate = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
    // A new child changes the captured selection's bounds, including a new
    // nested group whose descendants will arrive later in the same operation.
    if (gesture && [...gesture.snapshots.values()].some(captured => captured.members.has(shape.parentId as TLShapeId))) invalidate();
    if (source === 'user' && gesture && editor.isIn('select.translating')) gesture.created.add(shape.id);
    return shape;
  });
  const beforeDelete = editor.sideEffects.registerBeforeDeleteHandler('shape', (shape, source) => {
    if (!gesture || ![...gesture.snapshots.values()].some(captured => captured.members.has(shape.id) || captured.ancestors.has(shape.id))) return;
    const active = gesture.snapshots.get(selectedKey(editor));
    // Native Alt reset restores the original selection before removing copied
    // records. Only that inactive, known-created subtree may disappear without
    // invalidating the restored originals. Deleting an active copy still does.
    const revertingCopies = source === 'user' && editor.isIn('select.translating') && gesture.created.has(shape.id) && active &&
      !active.members.has(shape.id) && !active.ancestors.has(shape.id) && [...active.roots.keys()].every(id => !gesture!.created.has(id));
    if (!revertingCopies) invalidate();
  });
  const beforeBinding = editor.sideEffects.registerBeforeCreateHandler('binding', (binding) => {
    if (gesture && [...gesture.snapshots.values()].some(source => source.members.has(binding.fromId) || source.members.has(binding.toId) || source.ancestors.has(binding.fromId) || source.ancestors.has(binding.toId))) invalidate();
    return binding;
  });
  const beforeChange = editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next, source) => {
    if (applying) return next;
    if (!gesture || gesture.invalid) return next;
    // Any edited member or unselected ancestor changes the captured geometry.
    // Pure root translation is handled below; remote edits never receive snaps.
    for (const captured of gesture.snapshots.values()) {
      if (captured.ancestors.has(prev.id) || captured.members.has(prev.id) && (!captured.roots.has(prev.id) || !coordinateOnly(prev, next) || source !== 'user' || !editor.isIn('select.translating'))) { invalidate(); return next; }
    }
    if (!editor.isIn('select.translating')) return next;
    gesture.translated = true;
    if (source !== 'user' || editor.getCurrentToolId() !== 'select' || editor.getInstanceState().isReadonly || isCadNodeEditing(editor) || isDrawingPointerGestureActive(editor)) { indicator.set(null); return next; }
    if (gesture.pageId !== editor.getCurrentPageId() || gesture.revision !== drawingGuidesRevision(editor)) { invalidate(); return next; }
    const key = selectedKey(editor);
    let captured = gesture.snapshots.get(key);
    if (!captured) {
      // Alt's native duplicate branch selects newly created roots. Other changes
      // to selection are stale, not a new drag with guessed starting positions.
      if (!editor.getSelectedShapeIds().every(id => gesture!.created.has(id))) { invalidate(); return next; }
      captured = snapshot(editor) ?? undefined;
      if (!captured) { invalidate(); return next; }
      gesture.snapshots.set(key, captured);
    }
    const root = captured.roots.get(prev.id);
    if (!root || !coordinateOnly(prev, next)) return next;
    gesture.nativeAxes = nativeSnapAxes(editor);
    // History's native bailToMark restores these exact baseline coordinates even
    // while the statechart still says translating. Never snap a rollback.
    if (samePoint(next, root.shape)) { indicator.set(null); return next; }
    const options = readCadSnapSettings(editor);
    if (!options.guidelines || editor.user.getIsSnapMode() === !!editor.inputs.ctrlKey || editor.inputs.pointerVelocity.len() >= .5) { indicator.set(null); return next; }
    const movement = nativeDisplacement(editor, captured), tolerance = options.tolerance / editor.getZoomLevel();
    if (!movement || !Number.isFinite(tolerance) || tolerance <= 0) return next;
    const parent = editor.getShapeParentTransform(next);
    const proposed = parent ? parent.applyToPoint(next) : next;
    const nativeAxes = gesture.nativeAxes, blocked = new Set(nativeAxes);
    if (movement.locked) blocked.add(movement.locked);
    if (blocked.size === 2) { indicator.set(null); return next; }
    const actual = { x: proposed.x - root.point.x, y: proposed.y - root.point.y };
    if ((['x', 'y'] as const).some(axis => !nativeAxes.has(axis) && Math.abs(actual[axis] - movement.delta[axis]) > EPS)) { indicator.set(null); return next; }
    const cacheKey = JSON.stringify([actual, [...blocked], tolerance]);
    if (captured.cache?.key !== cacheKey) captured.cache = { key: cacheKey, result: guideCorrection(editor, captured, gesture.guides, actual, blocked, tolerance) };
    const snap = captured.cache.result;
    indicator.set(snap);
    if (!snap) return next;
    const local = editor.getPointInParentSpace(next, { x: proposed.x + snap.delta.x, y: proposed.y + snap.delta.y });
    return { ...next, x: local.x, y: local.y };
  });
  /** A stationary pointer can produce no native store write at all. Public
   * event/tick handlers run after native processing, outside nested UI writes
   * whose history is deliberately ignored. No extra history mark is created. */
  function reconcile(ended = false) {
    if (applying || !gesture) return;
    const moving = editor.isIn('select.translating');
    try {
      if (gesture.invalid || !gesture.translated || editor.getCurrentToolId() !== 'select' || editor.getInstanceState().isReadonly ||
          isCadNodeEditing(editor) || isDrawingPointerGestureActive(editor) || gesture.pageId !== editor.getCurrentPageId() || gesture.revision !== drawingGuidesRevision(editor)) return;
      const captured = gesture.snapshots.get(selectedKey(editor)), options = readCadSnapSettings(editor);
      if (!captured || !options.guidelines || editor.user.getIsSnapMode() === !!editor.inputs.ctrlKey || moving && editor.inputs.pointerVelocity.len() >= .5) { indicator.set(null); return; }
      const displacement = nativeDisplacement(editor, captured), tolerance = options.tolerance / editor.getZoomLevel();
      if (!displacement || !Number.isFinite(tolerance) || tolerance <= 0) return;
      const roots = [...captured.roots.values()], current = roots.map(root => editor.getShapePageTransform(root.shape.id)?.point());
      if (current.some(point => !point)) return;
      // Native Escape/Alt rollback always restores the baseline; no guide may
      // turn that cancellation into a new edit beside the original position.
      if (current.every((point, i) => samePoint(point!, roots[i].point))) return;
      const actual = { x: current[0]!.x - roots[0].point.x, y: current[0]!.y - roots[0].point.y };
      if (current.some((point, i) => !samePoint(point!, { x: roots[i].point.x + actual.x, y: roots[i].point.y + actual.y }))) { invalidate(); return; }
      const nativeAxes = moving ? nativeSnapAxes(editor) : gesture.nativeAxes, blocked = new Set(nativeAxes);
      if (displacement.locked) blocked.add(displacement.locked);
      if (blocked.size === 2) { indicator.set(null); return; }
      const native = { ...displacement.delta };
      for (const axis of nativeAxes) native[axis] = actual[axis];
      const snap = guideCorrection(editor, captured, gesture.guides, native, blocked, tolerance);
      if (!snap) { indicator.set(null); return; }
      const target = { x: native.x + snap.delta.x, y: native.y + snap.delta.y };
      if (samePoint(actual, target)) { indicator.set(snap); return; }
      if (!samePoint(actual, native)) { indicator.set(null); return; }
      const updates = roots.map(root => {
        const local = editor.getPointInParentSpace(root.shape, { x: root.point.x + target.x, y: root.point.y + target.y });
        return { id: root.shape.id, type: root.shape.type, x: local.x, y: local.y };
      });
      applying = true;
      try {
        editor.updateShapes(updates);
        // Native Alt-copy records its repeat-duplicate offset before onExit. If
        // the final release first acquired this guide, keep that public state
        // consistent with the actual copied artwork as part of the same batch.
        const duplicate = editor.getInstanceState().duplicateProps;
        if (ended && duplicate && roots.every(root => gesture!.created.has(root.shape.id)) &&
            JSON.stringify([...duplicate.shapeIds].sort()) === selectedKey(editor)) {
          editor.updateInstanceState({ duplicateProps: { ...duplicate, offset: { x: duplicate.offset.x + snap.delta.x, y: duplicate.offset.y + snap.delta.y } } });
        }
        indicator.set(snap);
      } finally { applying = false; }
    } finally { if (ended) clear(); }
  }
  const tick = () => { if (gesture && editor.isIn('select.translating')) reconcile(); };
  editor.on('tick', tick);
  const stop = react('clear inactive Pick guideline snap', () => {
    const path = editor.getPath(), readonly = editor.getInstanceState().isReadonly, pageId = editor.getCurrentPageId();
    if (!gesture) return;
    if (!['select.pointing_shape', 'select.pointing_selection', 'select.translating'].includes(path)) { clear(); return; }
    if (readonly || pageId !== gesture.pageId || drawingGuidesRevision(editor) !== gesture.revision || isCadNodeEditing(editor)) invalidate();
  });
  return () => { editor.off('event', event); editor.off('tick', tick); beforeCreate(); beforeDelete(); beforeBinding(); beforeChange(); stop(); clear(); };
}
