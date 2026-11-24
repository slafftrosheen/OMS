import { Box, type Editor, type TLShape } from '@tldraw/tldraw';
import { arrangementRoots } from './drawing-arrange';
import { getCadShapePageBounds } from './cad-bounds';
import { contourSegments, type CadContour } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';
import { drawingGuideLine, type DrawingGuideGeometry } from './drawing-guides';

const EPSILON = 1e-7;
const PARALLEL_EPSILON = 1e-12;
const MAX_CONSTRUCTION_SHAPES = 500;
const ARTWORK_TYPES = new Set(['group', 'geo', 'draw', 'highlight', 'line', 'text', 'image', 'cad-path', 'cad-bezier', 'cad-ellipse', 'cad-arc']);

/** Exact equidistant infinite line. Nonparallel lines have two bisectors, so
 * they are deliberately not interpreted as a unique "middle" guideline. */
export function middleDrawingGuide(a: DrawingGuideGeometry, b: DrawingGuideGeometry): DrawingGuideGeometry | null {
  const first = drawingGuideLine(a), second = drawingGuideLine(b);
  if (Math.abs(first.along.x * second.along.y - first.along.y * second.along.x) > PARALLEL_EPSILON) return null;
  const separation = (second.point.x - first.point.x) * first.normal.x + (second.point.y - first.point.y) * first.normal.y;
  if (!Number.isFinite(separation) || Math.abs(separation) <= EPSILON) return null;
  if (a.axis !== 'angle' && a.axis === b.axis) return { axis: a.axis, position: (a.position + b.position!) / 2 };
  const pivot = { x: (first.point.x + second.point.x) / 2, y: (first.point.y + second.point.y) / 2 };
  if (!validCadPoint(pivot)) return null;
  return { axis: 'angle', pivot, angle: a.axis === 'angle' ? a.angle : a.axis === 'x' ? 270 : 0 };
}

type AngledGuide = Extract<DrawingGuideGeometry, { axis: 'angle' }>;
export interface DrawingGuideBisectors {
  intersection: CadPoint;
  /** Sector angles, acute first. A perpendicular pair has two equal sectors. */
  angles: [number, number];
  perpendicular: boolean;
  /** Acute then obtuse; for equal sectors, A then B in ascending heading order. */
  guides: [AngledGuide, AngledGuide];
}

const lineHeading = (angle: number) => ((angle % 180) + 180) % 180;
function unorientedGuideLine(guide: DrawingGuideGeometry) {
  const angle = guide.axis === 'x' ? 90 : guide.axis === 'y' ? 0 : guide.angle;
  if (!Number.isFinite(angle) || Math.abs(angle) > 36000) return null;
  const point = drawingGuideLine(guide).point;
  if (!validCadPoint(point)) return null;
  const heading = lineHeading(angle);
  const along = heading === 0 ? { x: 1, y: 0 } : heading === 90 ? { x: 0, y: -1 }
    : drawingGuideLine({ axis: 'angle', pivot: point, angle: heading }).along;
  return { point, along, heading };
}

/** The two exact bisectors of infinite supporting lines. Canonical headings
 * keep the acute/obtuse choice independent of path direction and source order.
 * Almost parallel lines are rejected rather than amplifying floating-point
 * error into an unreliable, potentially distant intersection. */
export function bisectDrawingGuides(a: DrawingGuideGeometry, b: DrawingGuideGeometry): DrawingGuideBisectors | null {
  const firstLine = unorientedGuideLine(a), secondLine = unorientedGuideLine(b);
  if (!firstLine || !secondLine) return null;
  const [first, second] = [firstLine, secondLine].sort((a, b) => a.heading - b.heading);
  const determinant = first.along.x * second.along.y - first.along.y * second.along.x;
  if (Math.abs(determinant) <= EPSILON) return null;
  const dx = second.point.x - first.point.x, dy = second.point.y - first.point.y;
  const distance = (dx * second.along.y - dy * second.along.x) / determinant;
  const intersection = { x: first.point.x + distance * first.along.x, y: first.point.y + distance * first.along.y };
  if (!validCadPoint(intersection)) return null;
  const difference = second.heading - first.heading;
  const perpendicular = Math.abs(first.along.x * second.along.x + first.along.y * second.along.y) <= PARALLEL_EPSILON;
  const acute = perpendicular ? 90 : Math.min(difference, 180 - difference);
  const midpoint = (first.heading + second.heading) / 2;
  const headings = [lineHeading(midpoint), lineHeading(midpoint + 90)];
  if (perpendicular) headings.sort((a, b) => a - b);
  else if (difference > 90) headings.reverse();
  return {
    intersection, angles: [acute, 180 - acute], perpendicular,
    guides: headings.map(angle => ({ axis: 'angle', pivot: { ...intersection }, angle })) as [AngledGuide, AngledGuide],
  };
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
  bisectors: DrawingGuideBisectors | null;
}

/** Construction reads exact page-space bounds; selected groups count as one
 * object. Creating guides never changes the source artwork or its selection. */
export function drawingGuidesFromSelection(editor: Editor): DrawingGuideConstruction {
  const empty: DrawingGuideConstruction = { centers: [], gapX: null, gapY: null, parallel: null, bisectors: null };
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
      if (first && second) {
        result.parallel = middleDrawingGuide(first, second);
        result.bisectors = bisectDrawingGuides(first, second);
      }
    }
    return result;
  } catch { return empty; }
}
