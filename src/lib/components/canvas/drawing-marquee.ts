import { atom, Box, Group2d, intersectPolygonPolygon, pointInPolygon, polygonIntersectsPolyline, StateNode,
  type Editor, type Geometry2d, type TLShape, type TLShapeId, type Vec } from '@tldraw/tldraw';
import type { CadPoint } from './cad-settings';
import type { CadBezierShape } from './shapes/CadBezierShape';
import type { CadPathShape } from './shapes/CadShapes';

export type DrawingMarquee = { x: number; y: number; w: number; h: number; mode?: 'window' | 'crossing' | 'nodes' };
function marqueeAtom() { return atom<DrawingMarquee | null>('Drawing marquee', null); }
const marquees = new WeakMap<Editor, ReturnType<typeof marqueeAtom>>();
export function drawingMarquee(editor: Editor) {
  let marquee = marquees.get(editor);
  if (!marquee) { marquee = marqueeAtom(); marquees.set(editor, marquee); }
  return marquee;
}

export function marqueeBetween(origin: CadPoint, end: CadPoint, nodeMode = false): DrawingMarquee {
  return { ...Box.FromPoints([origin, end]).toJson(), mode: end.x < origin.x ? 'crossing' : nodeMode ? 'nodes' : 'window' };
}

function isClosedArtwork(shape: TLShape): boolean {
  if (shape.type === 'cad-bezier') return (shape as CadBezierShape).props.contours.some(contour => contour.closed);
  if (shape.type === 'cad-path') return (shape as CadPathShape).props.closed;
  return shape.type === 'cad-ellipse' || shape.type === 'geo';
}

function crossesOutline(part: Geometry2d, corners: Vec[]): boolean {
  if (part.isLabel) return false;
  if (part instanceof Group2d) return part.children.some(child => crossesOutline(child, corners));
  const points = part.vertices;
  return points.some(point => pointInPolygon(point, corners)) ||
    polygonIntersectsPolyline(corners, part.isClosed && points.length ? [...points, points[0]] : points);
}

function intersectsArtwork(editor: Editor, shape: TLShape, polygon: CadPoint[], closedOnly: boolean): boolean {
  const geometry = editor.getShapeGeometry(shape);
  const corners = editor.getShapePageTransform(shape).clone().invert().applyToPoints(polygon);
  // A marquee entirely inside visible fill also touches the object. A hole
  // in a compound path is resolved by the shape's own fill-rule hit test.
  const filled = geometry.isFilled || geometry instanceof Group2d && geometry.children.some(part => !part.isLabel && part.isFilled);
  if (filled && corners.some(point => geometry.hitTestPoint(point, 0, false))) return true;
  if (closedOnly && shape.type === 'cad-bezier' && geometry instanceof Group2d) {
    return (shape as CadBezierShape).props.contours.some((contour, i) => contour.closed && crossesOutline(geometry.children[i], corners));
  }
  return crossesOutline(geometry, corners);
}

export function marqueeObjects(editor: Editor, area: DrawingMarquee, closedOnly = false): TLShapeId[] {
  const brush = new Box(area.x, area.y, area.w, area.h), crossing = area.mode === 'crossing';
  const results = new Set<TLShapeId>();
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === 'group' || shape.opacity === 0 || editor.isShapeOrAncestorLocked(shape) ||
        (closedOnly && !isClosedArtwork(shape))) continue;
    const selectedShape = editor.getOutermostSelectableShape(shape);
    if (results.has(selectedShape.id)) continue;
    // Pick's window must enclose the group, including siblings outside it.
    const bounds = editor.getShapeMaskedPageBounds(crossing ? shape : selectedShape);
    if (!bounds) continue;
    if (bounds.corners.every(point => brush.containsPoint(point))) { results.add(selectedShape.id); continue; }
    if (!crossing || shape.type === 'frame' || !brush.collides(bounds)) continue;
    const mask = editor.getShapeMask(shape.id);
    const corners = mask ? intersectPolygonPolygon(mask, brush.corners) : brush.corners;
    if (corners?.length && intersectsArtwork(editor, shape, corners, closedOnly)) results.add(selectedShape.id);
  }
  return [...results];
}

class DrawingPickBrush extends StateNode {
  static override id = 'brushing';
  private startPage?: ReturnType<Editor['getCurrentPageId']>;

  override onEnter: NonNullable<StateNode['onEnter']> = info => {
    if (this.editor.inputs.altKey) { this.parent.transition('scribble_brushing', info); return; }
    this.startPage = this.editor.getCurrentPageId();
    this.preview();
  };

  private area() {
    const { originPagePoint, currentPagePoint } = this.editor.inputs;
    return marqueeBetween(originPagePoint, currentPagePoint);
  }

  private preview = () => drawingMarquee(this.editor).set(this.area());
  override onPointerMove = this.preview;
  override onTick: NonNullable<StateNode['onTick']> = ({ elapsed }) => this.editor.edgeScrollManager.updateEdgeScrolling(elapsed);
  override onKeyDown: NonNullable<StateNode['onKeyDown']> = info => {
    if (this.editor.inputs.altKey) this.parent.transition('scribble_brushing', info);
  };

  private finish = () => {
    const { editor } = this;
    if (this.startPage === editor.getCurrentPageId()) {
      const ids = marqueeObjects(editor, this.area());
      const selection = editor.inputs.shiftKey ? [...new Set([...editor.getSelectedShapeIds(), ...ids])] : ids;
      editor.run(() => editor.setSelectedShapes(selection), { history: 'ignore' });
    }
    this.parent.transition('idle');
  };

  override onPointerUp = this.finish;
  override onComplete = this.finish;
  override onCancel = () => { this.parent.transition('idle'); };
  override onInterrupt = this.onCancel;
  override onExit = () => { drawingMarquee(this.editor).set(null); };
}

/** Replace the Pick rectangle only. Native click, transform, handles and Alt
 * scribble interactions retain their existing select states. */
export function installDrawingPickMarquee(editor: Editor): () => void {
  const select = editor.getStateDescendant('select'), children = select?.children;
  const native = children?.brushing;
  if (!select || !children || !native) return () => {};
  const brush = new DrawingPickBrush(editor, select);
  children.brushing = brush;
  return () => {
    if (children.brushing !== brush) return;
    if (editor.isIn('select.brushing')) select.transition('idle');
    children.brushing = native;
  };
}
