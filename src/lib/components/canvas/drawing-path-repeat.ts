import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { getCadShapePageBounds } from './cad-bounds';
import { curvePathData, type CadContour } from './cad-curves';
import { shapeCadContours } from './cad-editing';
import { layoutPathCopies, type PathCopyPosition, type PathRepeatOptions } from './cad-path-repeat-layout';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { cadMmPerPixel, readCadSettings, validCadPoint, type CadPoint } from './cad-settings';
import { drawingTransaction } from './drawing-commands';
import { MAX_REPEAT_SHAPES } from './drawing-operations';

const COPY_TYPES = new Set(['group', 'geo', 'draw', 'highlight', 'line', 'text', 'image', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc']);
const GUIDE_TYPES = new Set(['line', 'geo', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc']);
const TURN = 2 * Math.PI;

export interface DrawingPathRepeatPlan {
  revision: string;
  guideId: TLShapeId;
  options: PathRepeatOptions;
  roots: TLShapeId[];
  created: number;
  length: number;
  pitch: number;
  motifCenter: CadPoint;
  guidePath: string;
  positions: PathCopyPosition[];
  outlines: CadPoint[][];
}

export function isPathRepeatGuide(shape: TLShape, page: string): boolean {
  return shape.parentId === page && shape.opacity > 0 && GUIDE_TYPES.has(shape.type);
}

function motifPoint(point: CadPoint, origin: CadPoint, { center, angle }: PathCopyPosition): CadPoint {
  const x = point.x - origin.x, y = point.y - origin.y;
  return { x: center.x + x * Math.cos(angle) - y * Math.sin(angle), y: center.y + x * Math.sin(angle) + y * Math.cos(angle) };
}

export function preparePathRepeat(
  editor: Editor, guideId: TLShapeId, options: PathRepeatOptions,
): DrawingPathRepeatPlan {
  const settings = readCadSettings(editor);
  if (!settings) throw new CadOperationError('pathDocument');
  const page = editor.getCurrentPageId();
  const guide = editor.getShape(guideId);
  const selected = editor.getSelectedShapeIds();
  if (!guide || !selected.includes(guideId) || !isPathRepeatGuide(guide, page)) throw new CadOperationError('pathGuide');
  const roots = selected.filter(id => id !== guideId);
  if (!roots.length) throw new CadOperationError('pathSelection');
  if (roots.some(id => editor.getShape(id)?.parentId !== page)) throw new CadOperationError('pathProtected');
  try { assertCadEditable(editor, roots); } catch { throw new CadOperationError('pathProtected'); }
  const members = [...editor.getShapeAndDescendantIds(roots)].map(id => editor.getShape(id));
  if (members.some(shape => !shape || !COPY_TYPES.has(shape.type) || editor.getShapeMask(shape.id) ||
      editor.getBindingsInvolvingShape(shape.id).length)) throw new CadOperationError('pathProtected');

  const tolerance = Math.max(1e-5, 0.01 / cadMmPerPixel(settings));
  let contour: CadContour;
  try {
    const contours = shapeCadContours(editor, guide, tolerance / 2);
    if (contours.length !== 1) throw new Error('multiple paths');
    [contour] = contours;
  } catch { throw new CadOperationError('pathGuide'); }
  const layout = layoutPathCopies(contour, options, tolerance / 2);
  if (typeof layout === 'string') throw new CadOperationError(layout);
  const created = members.length * layout.positions.length;
  if (created > MAX_REPEAT_SHAPES || editor.getCurrentPageShapeIds().size + created > editor.options.maxShapesPerPage ||
      JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(members).length * layout.positions.length > 1_850_000)
    throw new CadOperationError('pathCopyLimit');

  const boxes = (members as TLShape[]).filter(shape => shape.type !== 'group').map(shape => getCadShapePageBounds(editor, shape));
  if (!boxes.length || boxes.some(box => !box)) throw new CadOperationError('pathBounds');
  const box = Box.Common(boxes as Box[]);
  const motifCenter = { x: box.center.x, y: box.center.y };
  const corners = [{ x: box.x, y: box.y }, { x: box.maxX, y: box.y }, { x: box.maxX, y: box.maxY }, { x: box.x, y: box.maxY }];
  const outlines = layout.positions.map(position => corners.map(point => motifPoint(point, motifCenter, position)));
  const rootShapes = roots.map(id => editor.getShape(id)!);
  if (outlines.some(outline => !outline.every(validCadPoint)) ||
      layout.positions.some(position => rootShapes.some(shape => !validCadPoint(motifPoint(shape, motifCenter, position)))))
    throw new CadOperationError('pathBounds');
  return {
    revision: cadRevision(editor), guideId, options: structuredClone(options), roots, created,
    length: layout.length, pitch: layout.pitch, motifCenter, guidePath: curvePathData([contour]), positions: layout.positions, outlines,
  };
}

/** Copy native editable records as a group of operations. Validate every copy before retaining any. */
export function applyPathRepeat(editor: Editor, plan: DrawingPathRepeatPlan): boolean {
  try {
    if (plan.revision !== cadRevision(editor) || editor.getInstanceState().isReadonly) return false;
    editor.complete();
    editor.setCurrentTool('select');
    if (plan.revision !== cadRevision(editor)) return false;
    const fresh = preparePathRepeat(editor, plan.guideId, plan.options);
    const memberCount = editor.getShapeAndDescendantIds(fresh.roots).size;
    return drawingTransaction(editor, () => {
      const copiedRoots: TLShapeId[] = [];
      for (const position of fresh.positions) {
        const before = editor.getCurrentPageShapeIds();
        editor.duplicateShapes(fresh.roots);
        const copies = [...editor.getSelectedShapeIds()];
        if (copies.length !== fresh.roots.length || copies.some(id => before.has(id)) ||
            editor.getCurrentPageShapeIds().size !== before.size + memberCount) throw new Error('Incomplete path copy');
        const updates = copies.map(id => {
          const shape = editor.getShape(id);
          if (!shape || shape.parentId !== editor.getCurrentPageId()) throw new Error('Path copy moved to another parent');
          const point = motifPoint(shape, fresh.motifCenter, position);
          if (!validCadPoint(point)) throw new Error('Path copy exceeds the coordinate limit');
          return { id, type: shape.type, ...point, rotation: ((shape.rotation + position.angle) % TURN + TURN) % TURN };
        });
        editor.updateShapes(updates);
        for (const update of updates) {
          const shape = editor.getShape(update.id);
          if (!shape || Math.hypot(shape.x - update.x, shape.y - update.y) > 1e-6 ||
              Math.abs(Math.sin((shape.rotation - update.rotation) / 2)) > 1e-8) throw new Error('Path copy transform refused');
        }
        copiedRoots.push(...copies);
      }
      if (JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new Error('Drawing payload limit');
      editor.setSelectedShapes(copiedRoots);
    });
  } catch { return false; }
}
