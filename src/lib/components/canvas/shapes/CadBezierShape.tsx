import React from 'react';
import { vectorPaint } from '../cad-vector';
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
  type TLBaseShape,
  type TLDefaultColorStyle,
  type TLHandle,
  type TLOnHandleDragHandler,
  type TLOnResizeHandler
} from '@tldraw/tldraw';
import {
  curveBounds,
  curvePathData,
  flattenContours,
  mapContours,
  validContours,
  type CadContour
} from '../cad-curves';
export type CadBezierShape = TLBaseShape<
  'cad-bezier',
  { contours: CadContour[]; color: TLDefaultColorStyle; fillRule: 'evenodd' | 'nonzero' }
>;
const number = T.number;
const contours = T.arrayOf(
  T.object({
    closed: T.boolean,
    nodes: T.arrayOf(
      T.object({ x: number, y: number, inX: number, inY: number, outX: number, outY: number, mode: T.string })
    )
  })
).check((value) => {
  if (!validContours(value as CadContour[])) throw new Error('Invalid CAD curves');
});
class CurveGeometry extends Group2d {
  constructor(
    private contourBounds: ReturnType<typeof curveBounds>,
    children: Polyline2d[],
    private fillRule: 'evenodd' | 'nonzero',
    private filled: boolean
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
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        const side = (b.x-a.x)*(point.y-a.y)-(point.x-a.x)*(b.y-a.y);
        if (a.y <= point.y && b.y > point.y && side > 0) winding++;
        if (a.y > point.y && b.y <= point.y && side < 0) winding--;
      }
    }
    return this.fillRule === 'evenodd' ? Math.abs(winding) % 2 === 1 : winding !== 0;
  }
  override hitTestPoint(point: Vec, margin = 0, hitInside = false) {
    return super.hitTestPoint(point, margin, false) || (this.filled || hitInside) && this.contains(point);
  }
  override distanceToPoint(point: Vec, hitInside = false) {
    const distance = Math.abs(super.distanceToPoint(point, false));
    return (this.filled || hitInside) && this.contains(point) ? -distance : distance;
  }
}
export class CadBezierShapeUtil extends ShapeUtil<CadBezierShape> {
  static override type = 'cad-bezier' as const;
  static override props = { contours, color: DefaultColorStyle, fillRule: T.literalEnum('evenodd', 'nonzero') };
  override getDefaultProps(): CadBezierShape['props'] {
    return {
      contours: [
        {
          closed: false,
          nodes: [
            { x: 0, y: 0, inX: 0, inY: 0, outX: 30, outY: -30, mode: 'corner' },
            { x: 100, y: 0, inX: -30, inY: -30, outX: 0, outY: 0, mode: 'corner' }
          ]
        }
      ],
      fillRule: 'evenodd',
      color: 'black'
    };
  }
  override getGeometry(shape: CadBezierShape) {
    const bounds = curveBounds(shape.props.contours);
    // Hit testing is bounded and approximate; SVG rendering and saved control points are exact.
    const points = flattenContours(shape.props.contours, Math.max(0.25, bounds.w / 500, bounds.h / 500), 200000);
    return new CurveGeometry(
      bounds,
      points.map(
        (p, i) =>
          new Polyline2d({ points: (shape.props.contours[i].closed ? [...p, p[0]] : p).map((q) => new Vec(q.x, q.y)) })
      ),
      shape.props.fillRule,
      vectorPaint(shape.meta, shape.props.color).fill !== 'none'
    );
  }
  private path(shape: CadBezierShape) {
    const paint = vectorPaint(shape.meta, shape.props.color);
    return (
      <path
        d={curvePathData(shape.props.contours)}
        fill={paint.fill}
        fillRule={shape.props.fillRule}
        stroke={shape.meta.omsVectorPaint ? paint.stroke : getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })[shape.props.color].solid}
        strokeWidth={paint.strokeWidth}
        fillOpacity={paint.fillOpacity}
        strokeOpacity={paint.strokeOpacity}
        strokeLinecap={paint.lineCap}
        strokeLinejoin={paint.lineJoin}
        strokeMiterlimit={paint.miterLimit}
        strokeDasharray={paint.dash.length ? paint.dash.join(' ') : undefined}
        strokeDashoffset={paint.dashOffset}
      />
    );
  }
  override component(shape: CadBezierShape) {
    return <SVGContainer>{this.path(shape)}</SVGContainer>;
  }
  override indicator(shape: CadBezierShape) {
    const showHandles =
      this.editor.getSelectedShapeIds().includes(shape.id) &&
      shape.props.contours.reduce((n, c) => n + c.nodes.length, 0) <= 128;
    const guides = showHandles
      ? shape.props.contours
          .flatMap((c) =>
            c.nodes.map((n) => `M${n.x + n.inX},${n.y + n.inY}L${n.x},${n.y}L${n.x + n.outX},${n.y + n.outY}`)
          )
          .join(' ')
      : '';
    return (
      <g>
        <path d={curvePathData(shape.props.contours)} />
        {guides && <path d={guides} strokeDasharray="3 3" opacity={0.5} fill="none" />}
      </g>
    );
  }
  override toSvg(shape: CadBezierShape) {
    return this.path(shape);
  }
  override onResize: TLOnResizeHandler<CadBezierShape> = (shape, info) => ({
    props: { contours: mapContours(shape.props.contours, (p) => ({ x: p.x * info.scaleX, y: p.y * info.scaleY })) }
  });
  override getHandles(shape: CadBezierShape): TLHandle[] {
    // Large text compounds are edited one contour/node at a time in the docker.
    if (shape.props.contours.reduce((n, c) => n + c.nodes.length, 0) > 128) return [];
    const handles: Omit<TLHandle, 'index'>[] = [];
    shape.props.contours.forEach((c, ci) =>
      c.nodes.forEach((n, ni) => {
        handles.push({ id: `${ci}:${ni}:node`, x: n.x, y: n.y, type: 'vertex', canSnap: true });
        if (c.closed || ni > 0)
          handles.push({ id: `${ci}:${ni}:in`, x: n.x + n.inX, y: n.y + n.inY, type: 'virtual', canSnap: false });
        if (c.closed || ni < c.nodes.length - 1)
          handles.push({ id: `${ci}:${ni}:out`, x: n.x + n.outX, y: n.y + n.outY, type: 'virtual', canSnap: false });
      })
    );
    const indices = getIndices(handles.length);
    return handles.map((h, i) => ({ ...h, index: indices[i] }));
  }
  override onHandleDrag: TLOnHandleDragHandler<CadBezierShape> = (shape, { handle }) => {
    if (this.editor.getInstanceState().isReadonly || this.editor.isShapeOrAncestorLocked(shape)) return;
    const [ci, ni, kind] = handle.id.split(':'),
      list = structuredClone(shape.props.contours),
      node = list[Number(ci)]?.nodes[Number(ni)];
    if (!node) return;
    if (kind === 'node') {
      node.x = handle.x;
      node.y = handle.y;
    } else {
      const incoming = kind === 'in',
        x = handle.x - node.x,
        y = handle.y - node.y;
      const previousLength = Math.hypot(incoming ? node.outX : node.inX, incoming ? node.outY : node.inY);
      if (incoming) {
        node.inX = x;
        node.inY = y;
      } else {
        node.outX = x;
        node.outY = y;
      }
      const length = Math.hypot(x, y);
      if (node.mode !== 'corner' && length) {
        const ratio = node.mode === 'symmetric' ? 1 : previousLength / length;
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
    return { id: shape.id, type: shape.type, props: { contours: list } };
  };
}
