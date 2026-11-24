import { Box, type Editor, type TLShape } from '@tldraw/tldraw';
import { arrangementRoots } from './drawing-arrange';
import { getCadShapePageBounds } from './cad-bounds';
import { contourSegments, type CadContour } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';
import { drawingGuideLine, type DrawingGuideGeometry } from './drawing-guides';

const EPSILON = 1e-7;
const MAX_CONSTRUCTION_SHAPES = 500;
const ARTWORK_TYPES = new Set(['group', 'geo', 'draw', 'highlight', 'line', 'text', 'image', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc']);

/** Exact equidistant infinite line. Nonparallel lines have two bisectors, so
 * they are deliberately not interpreted as a unique "middle" guideline. */
export function middleDrawingGuide(a: DrawingGuideGeometry, b: DrawingGuideGeometry): DrawingGuideGeometry | null {
  const first = drawingGuideLine(a), second = drawingGuideLine(b);
  if (Math.abs(first.along.x * second.along.y - first.along.y * second.along.x) > EPSILON) return null;
  const separation = (second.point.x - first.point.x) * first.normal.x + (second.point.y - first.point.y) * first.normal.y;
  if (!Number.isFinite(separation) || Math.abs(separation) <= EPSILON) return null;
  if (a.axis !== 'angle' && a.axis === b.axis) return { axis: a.axis, position: (a.position + b.position!) / 2 };
  const pivot = { x: (first.point.x + second.point.x) / 2, y: (first.point.y + second.point.y) / 2 };
  if (!validCadPoint(pivot)) return null;
  return { axis: 'angle', pivot, angle: a.axis === 'angle' ? a.angle : a.axis === 'x' ? 270 : 0 };
}

function straightShapeGuide(editor: Editor, shape: TLShape): DrawingGuideGeometry | null {
  const props = shape.props as Record<string, any>;
  let points: CadPoint[];
  if (shape.type === 'cad-path' && !props.closed && Array.isArray(props.points)) points = props.points;
  else if (shape.type === 'line' && props.spline === 'line') {
    points = (Object.values(props.points) as Array<CadPoint & { index: string }>).sort((a, b) => a.index.localeCompare(b.index));
  } else if (shape.type === 'cad-bezier' && props.contours?.length === 1 && !props.contours[0].closed) {
    const contour = props.contours[0] as CadContour;
    if (contour.nodes.length > 1000) return null;
    points = [...contourSegments(contour)].flat();
  } else return null;
  if (points.length < 2 || points.length > 4000) return null;
  const matrix = editor.getShapePageTransform(shape);
  const mapped = points.map(p => matrix.applyToPoint(p)), start = mapped[0], end = mapped.at(-1)!;
  if (!mapped.every(validCadPoint)) return null;
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length <= EPSILON || mapped.some(p => Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx) / length > EPSILON)) return null;
  return { axis: 'angle', pivot: { x: start.x, y: start.y }, angle: Math.atan2(-dy, dx) * 180 / Math.PI };
}

export interface DrawingGuideConstruction {
  centers: DrawingGuideGeometry[];
  gapX: DrawingGuideGeometry | null;
  gapY: DrawingGuideGeometry | null;
  parallel: DrawingGuideGeometry | null;
}

/** Construction reads exact page-space bounds; selected groups count as one
 * object. Creating guides never changes the source artwork or its selection. */
export function drawingGuidesFromSelection(editor: Editor): DrawingGuideConstruction {
  const empty: DrawingGuideConstruction = { centers: [], gapX: null, gapY: null, parallel: null };
  try {
    const roots = arrangementRoots(editor);
    if (!roots.length || roots.length > MAX_CONSTRUCTION_SHAPES) return empty;
    let count = 0;
    const boxes = roots.map(id => {
      const leaves: Box[] = [];
      for (const member of editor.getShapeAndDescendantIds([id])) {
        if (++count > MAX_CONSTRUCTION_SHAPES) throw new Error('too-many-shapes');
        const shape = editor.getShape(member);
        if (!shape || !ARTWORK_TYPES.has(shape.type) || shape.opacity === 0 || editor.getShapeMask?.(member) ||
            (shape.meta.omsVectorPaint as { clips?: unknown[] })?.clips?.length) throw new Error('unsupported-artwork');
        if (shape.type === 'group') continue;
        const box = getCadShapePageBounds(editor, shape);
        if (!box || !validCadPoint({ x: box.x, y: box.y }) || !validCadPoint({ x: box.maxX, y: box.maxY })) throw new Error('invalid-bounds');
        leaves.push(box);
      }
      if (!leaves.length) throw new Error('empty-group');
      return Box.Common(leaves);
    });
    const common = Box.Common(boxes);
    const result: DrawingGuideConstruction = { ...empty, centers: [
      { axis: 'x', position: common.center.x }, { axis: 'y', position: common.center.y },
    ] };
    if (boxes.length === 2) {
      for (const axis of ['x', 'y'] as const) {
        const [first, second] = [...boxes].sort((a, b) => a[axis] - b[axis]);
        const end = axis === 'x' ? first.maxX : first.maxY;
        // No outside "gap" is manufactured for overlapping projected bounds.
        if (second[axis] >= end - EPSILON) result[axis === 'x' ? 'gapX' : 'gapY'] = { axis, position: (end + second[axis]) / 2 };
      }
      const first = straightShapeGuide(editor, editor.getShape(roots[0])!);
      const second = straightShapeGuide(editor, editor.getShape(roots[1])!);
      if (first && second) result.parallel = middleDrawingGuide(first, second);
    }
    return result;
  } catch { return empty; }
}
