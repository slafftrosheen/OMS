import {snapCadHandle} from '../cad-snap';
import React from "react";
import { VectorArtwork } from "../VectorArtwork";
import { getSelectedCadNode, getSelectedCadNodes, isCadNodeEditing, retainCadNodesAfterHandleDrag } from "../cad-node-selection";
import { assertCadEditable } from "../cad-plans";
import { transformAppearance } from "../cad-appearance";
import { vectorPaint, paintMetadata } from "../cad-vector";
import type { VectorPaint } from "../cad-paint";
import { cadFreehandPreview } from "../cad-freehand-state";
import { CAD_MAX_COORDINATE } from '../cad-limits';
import {
  ShapeUtil,
  SVGContainer,
  Group2d,
  Polyline2d,
  Box,
  Vec,
  T,
  DefaultColorStyle,
  getDefaultColorTheme,
  getIndices,
  useValue,
  type Editor,
  type TLBaseShape,
  type TLDefaultColorStyle,
  type TLHandle,
  type TLOnHandleDragHandler,
  type TLOnResizeHandler,
} from "@tldraw/tldraw";
import {
  curveBounds,
  curvePathData,
  flattenContours,
  mapContours,
  validContours,
  type CadContour,
} from "../cad-curves";
export type CadBezierShape = TLBaseShape<
  "cad-bezier",
  {
    contours: CadContour[];
    color: TLDefaultColorStyle;
    fillRule: "evenodd" | "nonzero";
  }
>;

/** The editor's compound-geometry hover path tests every child without a
 * bounds check. Keep distant Béziers out of that hot path before tessellation. */
export function installCadBezierHoverBounds(editor: Editor): () => void {
  const getShapeAtPoint = editor.getShapeAtPoint;
  const withBounds: typeof getShapeAtPoint = (point, options) => {
    if (!options?.renderingOnly) return getShapeAtPoint.call(editor, point, options);
    return getShapeAtPoint.call(editor, point, { ...options, filter: shape => {
      if (options.filter && !options.filter(shape)) return false;
      if (shape.type !== 'cad-bezier') return true;
      const paint = shape.meta.omsVectorPaint as { strokeWidth?: number } | undefined;
      const outline = typeof paint?.strokeWidth === 'number' && Number.isFinite(paint.strokeWidth) ? paint.strokeWidth / 2 : 1;
      const bounds = editor.getShapePageBounds(shape);
      return !bounds || bounds.containsPoint(point, (options.margin ?? 0) + Math.max(0, outline));
    } });
  };
  editor.getShapeAtPoint = withBounds;
  return () => { if (editor.getShapeAtPoint === withBounds) editor.getShapeAtPoint = getShapeAtPoint; };
}

function CadBezierArtwork({ editor, shape, artwork }: { editor: Editor; shape: CadBezierShape; artwork: React.ReactNode }) {
  const preview = useValue('Freehand source artwork', () => {
    const preview = cadFreehandPreview(editor).get();
    return preview?.geometry && preview.continuation?.localContours && preview.continuation.shapeId === shape.id ? preview : null;
  }, [editor, shape.id]);
  return preview?.geometry && preview.continuation?.localContours
    ? <g data-testid="cad-freehand-source-preview" data-shape-id={shape.id}><VectorArtwork id={`shape-${shape.id}`}
      contours={preview.continuation.localContours} fillRule={preview.geometry.fillRule} paint={preview.geometry.paint} /></g>
    : <>{artwork}</>;
}
const number = T.number;
const contours = T.arrayOf(
  T.object({
    closed: T.boolean,
    nodes: T.arrayOf(
      T.object({
        x: number,
        y: number,
        inX: number,
        inY: number,
        outX: number,
        outY: number,
        mode: T.string,
      }),
    ),
  }),
).check((value) => {
  if (!validContours(value as CadContour[]))
    throw new Error("Invalid CAD curves");
});
type CurveClip = { points: Array<Array<{ x: number; y: number }>>; fillRule: string };
/** Keep interactive tessellation bounded even for large, intricate imports.
 * Exact bounds and the displayed/exported Béziers still use the source nodes. */
function flattenForPicking(contours: CadContour[]) {
  const maxTolerance = 4 * CAD_MAX_COORDINATE;
  for (let tolerance = .25; ; tolerance = Math.min(maxTolerance, tolerance * 8)) {
    try { return flattenContours(contours, tolerance, 60000); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'limit' || tolerance === maxTolerance) throw error;
    }
  }
}
function inCurveClips(point: Vec, clips: CurveClip[]) {
  return clips.every((c) => {
    let winding = 0;
    for (const ps of c.points)
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i], b = ps[(i + 1) % ps.length];
        const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
        if (a.y <= point.y && b.y > point.y && side > 0) winding++;
        if (a.y > point.y && b.y <= point.y && side < 0) winding--;
      }
    return c.fillRule === "evenodd" ? Math.abs(winding) % 2 === 1 : winding !== 0;
  });
}
function curveClips(paint: VectorPaint): CurveClip[] {
  return (paint.clips ?? []).map(c => ({ points: flattenForPicking(c.contours), fillRule: c.fillRule }));
}
type StrokePick = { radius: number; visible: boolean; inClips: (point: Vec) => boolean };
function strokePick(paint: VectorPaint, opacity: number, loadClips = () => curveClips(paint)): StrokePick | null {
  if (paint.fill !== 'none' || paint.gradient || paint.raster) return null;
  // Dashes are a visual style. Pick the continuous path so thin or dashed
  // production outlines remain selectable anywhere near their geometry.
  let masks: CurveClip[] | undefined;
  let x = NaN, y = NaN, included = false;
  return { radius: paint.strokeWidth / 2, visible: paint.stroke !== 'none' && paint.strokeWidth > 0 && paint.strokeOpacity > 0 && opacity > 0,
    inClips(point) {
      // Native Group2d picking asks every contour about the same point. Reuse
      // one mask test instead of repeating a compound clip for every branch.
      if (point.x !== x || point.y !== y) { x = point.x; y = point.y; included = inCurveClips(point, masks ??= loadClips()); }
      return included;
    } };
}
class StrokePolyline extends Polyline2d {
  constructor(private loadPoints: () => Vec[], private strokeHit: () => StrokePick | null) { super({ points: [] }); }
  override getVertices() { return this.points = this.loadPoints(); }
  override distanceToPoint(point: Vec, hitInside = false) {
    const stroke = this.strokeHit();
    // Editor.getShapeAtPoint tests Group2d children directly and skips a
    // hollow group that encloses the viewport. Only the stroke is pickable.
    this.isFilled = !!stroke;
    if (!stroke) return super.distanceToPoint(point, hitInside);
    if (!stroke.visible || !stroke.inClips(point)) return Infinity;
    return super.distanceToPoint(point, false) - stroke.radius;
  }
  override hitTestPoint(point: Vec, margin = 0, hitInside = false) {
    return this.strokeHit() ? this.distanceToPoint(point, false) <= margin : super.hitTestPoint(point, margin, hitInside);
  }
}
class CurveGeometry extends Group2d {
  constructor(
    private contourBounds: ReturnType<typeof curveBounds>,
    children: Polyline2d[],
    private fillRule: "evenodd" | "nonzero",
    private filled: boolean,
    private loadClips: () => CurveClip[],
    private strokeHit: () => StrokePick | null,
  ) {
    super({ children });
    this.isFilled = filled;
  }
  override getBounds() {
    const b = this.contourBounds;
    return new Box(b.x, b.y, b.w, b.h);
  }
  override getVertices() {
    return this.getBounds().corners;
  }
  private contains(point: Vec) {
    let winding = 0;
    for (const child of this.children) {
      const vertices = child.vertices;
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % vertices.length];
        const side =
          (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
        if (a.y <= point.y && b.y > point.y && side > 0) winding++;
        if (a.y > point.y && b.y <= point.y && side < 0) winding--;
      }
    }
    return this.fillRule === "evenodd"
      ? Math.abs(winding) % 2 === 1
      : winding !== 0;
  }
  private inClips(point: Vec) {
    return inCurveClips(point, this.loadClips());
  }
  override hitTestPoint(point: Vec, margin = 0, hitInside = false) {
    if (this.strokeHit()) return super.hitTestPoint(point, margin, false);
    if (!this.inClips(point)) return false;
    return (
      super.hitTestPoint(point, margin, false) ||
      ((this.filled || hitInside) && this.contains(point))
    );
  }
  override distanceToPoint(point: Vec, hitInside = false) {
    if (this.strokeHit()) return super.distanceToPoint(point, false);
    const distance = Math.abs(super.distanceToPoint(point, false));
    return this.inClips(point) &&
      (this.filled || hitInside) &&
      this.contains(point)
      ? -distance
      : distance;
  }
}
export class CadBezierShapeUtil extends ShapeUtil<CadBezierShape> {
  static override type = "cad-bezier" as const;
  override hideResizeHandles = () => isCadNodeEditing(this.editor);
  override hideRotateHandle = () => isCadNodeEditing(this.editor);
  override hideSelectionBoundsFg = () => isCadNodeEditing(this.editor);
  static override props = {
    contours,
    color: DefaultColorStyle,
    fillRule: T.literalEnum("evenodd", "nonzero"),
  };
  override getDefaultProps(): CadBezierShape["props"] {
    return {
      contours: [
        {
          closed: false,
          nodes: [
            { x: 0, y: 0, inX: 0, inY: 0, outX: 30, outY: -30, mode: "corner" },
            {
              x: 100,
              y: 0,
              inX: -30,
              inY: -30,
              outX: 0,
              outY: 0,
              mode: "corner",
            },
          ],
        },
      ],
      fillRule: "evenodd",
      color: "black",
    };
  }
  override getGeometry(shape: CadBezierShape) {
    const shapeContours = shape.props.contours;
    const bounds = curveBounds(shapeContours);
    const paint = vectorPaint(shape.meta, shape.props.color);
    let clips: CurveClip[] | undefined;
    const loadClips = () => clips ??= curveClips(paint);
    let meta = shape.meta, opacity = shape.opacity, stroke = strokePick(paint, opacity, loadClips);
    const strokeHit = () => {
      // The installed Editor's geometry cache compares props, not metadata or
      // opacity. Outline edits must change picking without changing saved nodes.
      const current = this.editor.getShape(shape.id) ?? shape;
      if (current.meta !== meta || current.opacity !== opacity) {
        meta = current.meta; opacity = current.opacity;
        stroke = strokePick(vectorPaint(meta, shape.props.color), opacity);
      }
      return stroke;
    };
    // Culling, fitting and selection bounds do not need a polyline per curve.
    let points: ReturnType<typeof flattenContours> | undefined;
    return new CurveGeometry(
      bounds,
      shapeContours.map((contour, i) => new StrokePolyline(() => {
        const vertices = (points ??= flattenForPicking(shapeContours))[i];
        return (contour.closed ? [...vertices, vertices[0]] : vertices).map(point => new Vec(point.x, point.y));
      }, strokeHit)),
      shape.props.fillRule,
      paint.fill !== "none" || !!paint.raster || !!paint.gradient,
      loadClips,
      strokeHit,
    );
  }
  private path(shape: CadBezierShape) {
    const paint = vectorPaint(shape.meta, shape.props.color);
    if (!shape.meta.omsVectorPaint)
      paint.stroke = getDefaultColorTheme({
        isDarkMode: this.editor.user.getIsDarkMode(),
      })[shape.props.color].solid;
    return (
      <VectorArtwork
        id={`shape-${shape.id}`}
        contours={shape.props.contours}
        fillRule={shape.props.fillRule}
        paint={paint}
      />
    );
  }

  override component(shape: CadBezierShape) {
    return <SVGContainer><CadBezierArtwork editor={this.editor} shape={shape} artwork={this.path(shape)} /></SVGContainer>;
  }
  override indicator(shape: CadBezierShape) {
    const guides = this.editor.getOnlySelectedShape()?.id === shape.id
      ? (this.editor.getShapeHandles(shape) ?? []).flatMap(handle => {
        if (handle.type !== 'virtual') return [];
        const [ci, ni] = handle.id.split(':').map(Number);
        const node = shape.props.contours[ci].nodes[ni];
        return `M${node.x},${node.y}L${handle.x},${handle.y}`;
      }).join(' ')
      : '';
    return (
      <g>
        <path d={curvePathData(shape.props.contours)} />
        {guides && (
          <path d={guides} strokeDasharray="3 3" opacity={0.5} fill="none" />
        )}
      </g>
    );
  }
  override toSvg(shape: CadBezierShape) {
    return this.path(shape);
  }
  override onResize: TLOnResizeHandler<CadBezierShape> = (shape, info) => ({
    props: {
      contours: mapContours(shape.props.contours, (p) => ({
        x: p.x * info.scaleX,
        y: p.y * info.scaleY,
      })),
    },
    meta: {
      ...shape.meta,
      omsVectorPaint: paintMetadata(
        transformAppearance(vectorPaint(shape.meta, shape.props.color), [
          info.scaleX,
          0,
          0,
          info.scaleY,
          0,
          0,
        ]),
      ),
    },
  });
  override getHandles(shape: CadBezierShape): TLHandle[] {
    if (!isCadNodeEditing(this.editor) || this.editor.getOnlySelectedShape()?.id !== shape.id) return [];
    const contours = shape.props.contours;
    const dense = contours.reduce((count, contour) => count + contour.nodes.length, 0) > 128;
    const active = dense ? getSelectedCadNode(this.editor) : null;
    const viewport = dense ? this.editor.getViewportPageBounds() : null;
    const transform = dense ? this.editor.getShapePageTransform(shape) : null;
    const zoom = dense ? this.editor.getZoomLevel() : 1;
    const padding = 10 / zoom;
    const cellSize = viewport ? Math.max(12 / zoom, Math.sqrt(viewport.w * viewport.h / 128)) : 1;
    const cells = new Set<string>();
    const cellAt = (point: { x: number; y: number }) =>
      `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const handles: Omit<TLHandle, 'index'>[] = [];
    const add = (ci: number, ni: number, kind: 'node' | 'in' | 'out', x: number, y: number) => {
      handles.push({ id: `${ci}:${ni}:${kind}`, x, y, type: kind === 'node' ? 'vertex' : 'virtual', canSnap: false });
    };
    const addNode = (ci: number, ni: number, controls: boolean) => {
      const contour = contours[ci], node = contour.nodes[ni];
      add(ci, ni, 'node', node.x, node.y);
      if (!controls) return;
      // Collapsed control handles cover the anchor's pointer target.
      if ((contour.closed || ni > 0) && (node.inX || node.inY))
        add(ci, ni, 'in', node.x + node.inX, node.y + node.inY);
      if ((contour.closed || ni < contour.nodes.length - 1) && (node.outX || node.outY))
        add(ci, ni, 'out', node.x + node.outX, node.y + node.outY);
    };

    // Keep the active node and its control handles. Sample the other anchors
    // in screen-space cells so zooming into dense artwork reveals nearby nodes.
    if (active && transform) {
      addNode(active.contourIndex, active.nodeIndex, true);
      cells.add(cellAt(transform.applyToPoint(contours[active.contourIndex].nodes[active.nodeIndex])));
    }
    contours.forEach((contour, ci) => contour.nodes.forEach((node, ni) => {
      if (!viewport || !transform) {
        addNode(ci, ni, true);
        return;
      }
      if (handles.length >= 160 || (active?.contourIndex === ci && active.nodeIndex === ni)) return;
      const point = transform.applyToPoint(node);
      if (point.x < viewport.minX - padding || point.x > viewport.maxX + padding ||
          point.y < viewport.minY - padding || point.y > viewport.maxY + padding) return;
      const cell = cellAt(point);
      if (cells.has(cell)) return;
      cells.add(cell);
      addNode(ci, ni, false);
    }));
    const indices = getIndices(handles.length);
    return handles.map((h, i) => ({ ...h, index: indices[i] }));
  }
  override onHandleDrag: TLOnHandleDragHandler<CadBezierShape> = (
    shape,
    { handle },
  ) => {
    try { assertCadEditable(this.editor, [shape.id]); } catch { return; }
    const [ci, ni, kind] = handle.id.split(":"),
      list = structuredClone(shape.props.contours),
      node = list[Number(ci)]?.nodes[Number(ni)];
    if (!node) return;
    if (kind === "node") {
      const point = this.editor.inputs.shiftKey ? handle : snapCadHandle(this.editor, shape, handle);
      const dx = point.x - node.x, dy = point.y - node.y;
      const selected = getSelectedCadNodes(this.editor);
      if (selected.some(value => list[value.contourIndex].nodes[value.nodeIndex] === node)) {
        for (const value of selected) {
          const member = list[value.contourIndex].nodes[value.nodeIndex];
          member.x += dx;
          member.y += dy;
        }
      }
      node.x = point.x;
      node.y = point.y;
    } else {
      const incoming = kind === "in",
        x = handle.x - node.x,
        y = handle.y - node.y;
      const previousLength = Math.hypot(
        incoming ? node.outX : node.inX,
        incoming ? node.outY : node.inY,
      );
      if (incoming) {
        node.inX = x;
        node.inY = y;
      } else {
        node.outX = x;
        node.outY = y;
      }
      const length = Math.hypot(x, y);
      if (node.mode !== "corner" && length) {
        const ratio = node.mode === "symmetric" ? 1 : previousLength / length;
        if (incoming) {
          node.outX = -x * ratio;
          node.outY = -y * ratio;
        } else {
          node.inX = -x * ratio;
          node.inY = -y * ratio;
        }
      }
    }
    if (!validContours(list)) return;
    retainCadNodesAfterHandleDrag(this.editor, list);
    return { id: shape.id, type: shape.type, props: { contours: list } };
  };
}
