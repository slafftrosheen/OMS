import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { getCadShapePageBounds } from './cad-bounds';
import { cadRevision, CadOperationError } from './cad-plans';
import { validCadPoint, type CadPoint } from './cad-settings';
import { MAX_REPEAT_SHAPES } from './drawing-operations';

const TYPES = new Set(['group', 'geo', 'draw', 'highlight', 'line', 'text', 'image', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc', 'cad-dimension']);
const TAU = Math.PI * 2;
export interface RadialOptions {
  center: CadPoint;
  angle: number; // degrees, positive counterclockwise
  copies: number; // additional copies; zero rotates the original selection
  rotateCopies: boolean; // false translates the complete selection as one motif
}
export interface RadialPlan {
  revision: string;
  selected: TLShapeId[];
  roots: TLShapeId[];
  options: RadialOptions;
  generated: number;
  sourceBox: CadPoint[];
  placements: CadPoint[][];
}
const rotate = (p: CadPoint, center: CadPoint, a: number): CadPoint => ({
  x: center.x + (p.x - center.x) * Math.cos(a) - (p.y - center.y) * Math.sin(a),
  y: center.y + (p.x - center.x) * Math.sin(a) + (p.y - center.y) * Math.cos(a)
});
const corners = (b: Box): CadPoint[] => [{x:b.x,y:b.y},{x:b.maxX,y:b.y},{x:b.maxX,y:b.maxY},{x:b.x,y:b.maxY}];

function selection(editor: Editor, expected: readonly TLShapeId[]) {
  if (!expected.length) throw new CadOperationError('radialSelection');
  const current = editor.getSelectedShapeIds();
  if (current.length !== expected.length || current.some(id => !expected.includes(id))) throw new CadOperationError('radialStale');
  const selected = new Set(expected);
  const roots = [...selected].filter(id => {
    let parent = editor.getShape(id)?.parentId; const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      if (selected.has(parent as TLShapeId)) return false;
      seen.add(parent); parent = editor.getShape(parent as TLShapeId)?.parentId;
    }
    return true;
  });
  const shapes = [...editor.getShapeAndDescendantIds(roots)].map(id => editor.getShape(id));
  if (editor.getInstanceState().isReadonly || shapes.some(s => !s || !TYPES.has(s.type) || editor.isShapeOrAncestorLocked(s))) throw new CadOperationError('radialProtected');
  // Moving bound objects or cropped children can change visible geometry independently
  // of their rigid transform. Keep this operation explicit and predictable.
  if (shapes.some(s => editor.getShapeMask(s!.id) || editor.getBindingsInvolvingShape(s!.id).length ||
    s!.type !== 'group' && s!.type !== 'cad-arc' && editor.getShapeUtil(s!).hideRotateHandle(s!))) throw new CadOperationError('radialUnsupported');
  return { roots, shapes: shapes as TLShape[] };
}
function placement(point: CadPoint, options: RadialOptions, motifCenter: CadPoint, step: number) {
  const angle = -options.angle * Math.PI / 180 * step;
  if (options.rotateCopies || !options.copies) return rotate(point, options.center, angle);
  const moved = rotate(motifCenter, options.center, angle);
  return { x: point.x + moved.x - motifCenter.x, y: point.y + moved.y - motifCenter.y };
}
function geometry(editor: Editor, shapes: TLShape[]) {
  const boxes = shapes.filter(s => s.type !== 'group').map(s => getCadShapePageBounds(editor, s));
  if (!boxes.length || boxes.some(b => !b || !corners(b).every(validCadPoint))) throw new CadOperationError('radialBounds');
  return Box.Common(boxes as Box[]);
}

export function prepareRadialPlan(editor: Editor, options: RadialOptions, expected = [...editor.getSelectedShapeIds()]): RadialPlan {
  const { center, angle, copies, rotateCopies } = options;
  if (!center || !validCadPoint(center) || !Number.isFinite(angle) || Math.abs(angle) < 1e-8 || Math.abs(angle) >= 360 ||
    !Number.isInteger(copies) || copies < 0 || copies > 200 || typeof rotateCopies !== 'boolean' ||
    copies > 0 && Math.abs(angle) * copies >= 360 - 1e-8) throw new CadOperationError('radialInvalid');
  const { roots, shapes } = selection(editor, expected), generated = copies * shapes.length;
  if (generated > MAX_REPEAT_SHAPES || generated + editor.getCurrentPageShapeIds().size > editor.options.maxShapesPerPage) throw new CadOperationError('radialLimit');
  if (copies && editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(shapes).length * copies > 1_850_000) throw new CadOperationError('radialLimit');
  const bounds = geometry(editor, shapes), sourceBox = corners(bounds);
  if (copies && !rotateCopies && Math.hypot(center.x-bounds.center.x,center.y-bounds.center.y)<1e-8) throw new CadOperationError('radialCoincident');
  const placements = Array.from({length:Math.max(1,copies)}, (_, i) => sourceBox.map(p => placement(p, options, bounds.center, i+1)));
  // Conservative transformed selection bounds cover every descendant, including groups.
  if (placements.some(box => box.some(p => !validCadPoint(p)))) throw new CadOperationError('radialBounds');
  for (const id of roots) {
    const shape = editor.getShape(id)!, origin = editor.getShapePageTransform(shape).point();
    for (let i = 1; i <= Math.max(1,copies); i++) {
      const target = placement(origin, options, bounds.center, i);
      if (!validCadPoint(target) || !validCadPoint(editor.getPointInParentSpace(shape, target))) throw new CadOperationError('radialBounds');
    }
  }
  return { revision:cadRevision(editor), selected:[...expected], roots, options:structuredClone(options), generated, sourceBox, placements };
}

/** Apply only the reviewed document/selection. Native duplication retains groups and assets. */
export function applyRadialPlan(editor: Editor, plan: RadialPlan): boolean {
  try {
    if (plan.revision !== cadRevision(editor)) return false;
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision !== cadRevision(editor)) return false;
    const fresh = prepareRadialPlan(editor, plan.options, plan.selected);
    const { roots, shapes } = selection(editor, fresh.selected), options = fresh.options;
    const bounds = geometry(editor, shapes);
    const poses = roots.map(id => { const shape = editor.getShape(id)!; return { point:editor.getShapePageTransform(shape).point(), rotation:editor.getShapePageTransform(shape).rotation() }; });
    const camera = {...editor.getCamera()};
    const success = drawingTransaction(editor, () => {
      const created: TLShapeId[] = [];
      for (let step = 1; step <= Math.max(1,options.copies); step++) {
        let targets = roots;
        if (options.copies) {
          const before = editor.getCurrentPageShapeIds();
          editor.duplicateShapes(roots);
          targets = [...editor.getSelectedShapeIds()];
          if (editor.getCurrentPageShapeIds().size - before.size !== shapes.length || targets.length !== roots.length || targets.some(id => before.has(id))) throw new Error('Incomplete circular copy');
          created.push(...targets);
        }
        const expectedPoses: Array<{point:CadPoint;rotation:number}> = [];
        const updates = targets.map((id, i) => {
          const shape = editor.getShape(id)!;
          // Native duplicate selection order is not a source-to-copy mapping. Each
          // copy still has its source's page pose before this transform.
          const initial = options.copies ? {point:editor.getShapePageTransform(shape).point(),rotation:editor.getShapePageTransform(shape).rotation()} : poses[i];
          const point = placement(initial.point, options, bounds.center, step);
          const local = editor.getPointInParentSpace(shape, point);
          const parentRotation = editor.getShapePageTransform(shape).rotation() - shape.rotation;
          const delta = options.rotateCopies || !options.copies ? -options.angle * Math.PI / 180 * step : 0;
          const rotation = ((initial.rotation + delta - parentRotation) % TAU + TAU) % TAU;
          if (!validCadPoint(local)) throw new Error('Circular copy outside drawing limits');
          expectedPoses.push({point,rotation:initial.rotation+delta});
          return {id,type:shape.type,x:local.x,y:local.y,rotation};
        });
        editor.updateShapes(updates);
        // Refused/adjusted mutations must roll back instead of claiming exact placement.
        for (const [i,update] of updates.entries()) {
          const actual = editor.getShape(update.id);
          if (!actual) throw new Error('Circular transform refused');
          const matrix=editor.getShapePageTransform(actual), point=matrix.point(), expected=expectedPoses[i];
          if (Math.hypot(point.x-expected.point.x,point.y-expected.point.y)>1e-6 || Math.abs(Math.sin((matrix.rotation()-expected.rotation)/2))>1e-8) throw new Error('Circular transform refused');
        }
      }
      if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new Error('Drawing payload limit');
      editor.setSelectedShapes(options.copies ? [...roots,...created] : roots);
    });
    editor.setCamera(camera);
    return success;
  } catch { return false; }
}
