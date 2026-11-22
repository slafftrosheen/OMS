import {snapCadHandle} from '../cad-snap';
import { vectorPaint, paintMetadata, validVectorPaint, type VectorPaint } from '../cad-vector';
import { transformAppearance, type VectorMatrix } from '../cad-appearance';
import { VectorPathArtwork } from '../VectorArtwork';
import { cadAnalyticPath, cadShapePaint, cadPaintHasFill, cadPaintClipTest } from '../cad-shape-appearance';
import React from 'react';
import { ShapeUtil, SVGContainer, Polyline2d, Polygon2d, Ellipse2d, Group2d, Box, Vec, T,
  DefaultColorStyle, getDefaultColorTheme, getIndices, resizeBox, useValue, type Editor, type TLBaseShape,
  type TLDefaultColorStyle, type TLHandle, type TLOnHandleDragHandler, type TLOnResizeHandler } from '@tldraw/tldraw';
import { useCadText } from '../cad-copy';
import { CAD_DIMENSION_KINDS, CAD_DIMENSION_SOURCE_LIMIT, CAD_RADIAL_DIMENSION_KINDS, getDimensionEndpoints,
  type CadDimensionLink, type CadRadialDimensionKind } from '../cad-dimension-links';
import { CAD_MAX_COORDINATE, CAD_MAX_POINTS, canvasLengthToUnit, readCadSettings, type CadPoint } from '../cad-settings';

const bounded = T.number.check(n => { if (!Number.isFinite(n) || Math.abs(n) > CAD_MAX_COORDINATE) throw new Error('CAD coordinate out of bounds'); });
const positive = bounded.check(n => { if (n <= 0) throw new Error('Positive CAD size required'); });
const pointsValidator = T.arrayOf(T.object({ x: bounded, y: bounded })).check(p => {
  if (p.length < 2 || p.length > CAD_MAX_POINTS) throw new Error('CAD contour needs 2–256 nodes');
});
export type CadPathShape = TLBaseShape<'cad-path', { points: CadPoint[]; closed: boolean; color: TLDefaultColorStyle }>;
export type CadEllipseShape = TLBaseShape<'cad-ellipse', { w: number; h: number; color: TLDefaultColorStyle }>;
export type CadArcShape = TLBaseShape<'cad-arc', { radius: number; startAngle: number; endAngle: number; color: TLDefaultColorStyle }>;
export type CadDimensionShape = TLBaseShape<'cad-dimension', { endX: number; endY: number; offset: number; decorationScale: number; color: TLDefaultColorStyle; link?: CadDimensionLink | null; radialKind?: CadRadialDimensionKind | null; angleSweep?: number | null }>;
const vectors = (points: CadPoint[]) => points.map(p => new Vec(p.x, p.y));
function pathData(points: CadPoint[], closed: boolean) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + (closed ? ' Z' : ''); }
function color(editor: Editor, value: TLDefaultColorStyle) { return getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })[value].solid; }

/** Native rotated resize assumes the page bounds centre is the transformed local
 * bounds centre. Use a rectangular transform envelope while retaining child
 * geometry for hit testing; physical measurements use cad-bounds, never this envelope. */
class CadTransformGeometry extends Group2d {
  constructor(options: { children: Array<Polyline2d | Polygon2d> }, private inClips: (point: Vec) => boolean = () => true) { super(options); }
  override hitTestPoint(point: Vec, margin = 0, hitInside = false) {
    return this.inClips(point) && super.hitTestPoint(point, margin, hitInside);
  }
  override distanceToPoint(point: Vec, hitInside = false) {
    const distance = super.distanceToPoint(point, hitInside);
    return this.inClips(point) ? distance : Math.abs(distance);
  }
  override getVertices() { return Box.Common(this.children.map(child => child.bounds)).corners; }
}

class CadEllipseGeometry extends Ellipse2d {
  private inClips: (point: Vec) => boolean;
  constructor(w: number, h: number, private pageRotation: number, paint: VectorPaint) {
    super({ width: w, height: h, isFilled: cadPaintHasFill(paint) });
    this.inClips = cadPaintClipTest(paint);
  }
  override hitTestPoint(point: Vec, margin = 0, hitInside = false) {
    return this.inClips(point) && super.hitTestPoint(point, margin, hitInside);
  }
  override distanceToPoint(point: Vec, hitInside = false) {
    const distance = super.distanceToPoint(point, hitInside);
    return this.inClips(point) ? distance : Math.abs(distance);
  }
  override getVertices() {
    const rx = this.w / 2, ry = this.h / 2, c = Math.cos(this.pageRotation), s = Math.sin(this.pageRotation);
    const x = Math.atan2(-ry * s, rx * c), y = Math.atan2(ry * c, rx * s);
    const angles = [...Array.from({ length: 120 }, (_, i) => i * Math.PI / 60), x, x + Math.PI, y, y + Math.PI];
    return angles.map(a => (a + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b)
      .map(a => new Vec(rx + rx * Math.cos(a), ry + ry * Math.sin(a)));
  }
}

/** Preserve local artwork coordinates through signed resize and native ellipse rebasing. */
function resizedPaint(shape: CadPathShape | CadEllipseShape | CadArcShape, matrix: VectorMatrix) {
  return shape.meta.omsVectorPaint ? { meta: { ...shape.meta, omsVectorPaint: paintMetadata(transformAppearance(vectorPaint(shape.meta, shape.props.color), matrix)) } } : {};
}
function analyticArtwork(editor: Editor, shape: CadPathShape | CadEllipseShape | CadArcShape, prefix = 'shape') {
  const paint = cadShapePaint(shape);
  if (!validVectorPaint(shape.meta.omsVectorPaint)) paint.stroke = color(editor, shape.props.color);
  let data: string;
  try { data = cadAnalyticPath(shape); } catch {
    // Older snapshots can contain schema-valid zero, reversed or full-turn
    // arc sweeps. Preserve their previous SVG rendering instead of throwing
    // during React render. Editing/copying still rejects invalid CAD geometry.
    if (shape.type !== 'cad-arc') return null;
    data = cadArcPath(shape.props);
  }
  return <VectorPathArtwork id={`${prefix}-${shape.id}`} data={data} fillRule="evenodd" paint={paint} />;
}

export class CadPathShapeUtil extends ShapeUtil<CadPathShape> {
  static override type = 'cad-path' as const;
  static override props = { points: pointsValidator, closed: T.boolean, color: DefaultColorStyle };
  override getDefaultProps(): CadPathShape['props'] { return { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false, color: 'black' }; }
  override getGeometry(shape: CadPathShape) {
    const paint = cadShapePaint(shape);
    return new CadTransformGeometry({ children: [shape.props.closed ? new Polygon2d({ points: vectors(shape.props.points), isFilled: cadPaintHasFill(paint) }) : new Polyline2d({ points: vectors(shape.props.points) })] }, cadPaintClipTest(paint));
  }
  override component(shape: CadPathShape) { return <SVGContainer>{analyticArtwork(this.editor, shape)}</SVGContainer>; }
  override indicator(shape: CadPathShape) { return <path d={pathData(shape.props.points, shape.props.closed)} />; }
  override toSvg(shape: CadPathShape) { return analyticArtwork(this.editor, shape, 'svg'); }
  override getHandles(shape: CadPathShape): TLHandle[] {
    const indices = getIndices(shape.props.points.length);
    return shape.props.points.map((p, i) => ({ ...p, id: String(i), type: 'vertex', index: indices[i], canSnap: false }));
  }
  override onHandleDrag: TLOnHandleDragHandler<CadPathShape> = (shape, { handle }) => {
    if (this.editor.getInstanceState().isReadonly || this.editor.isShapeOrAncestorLocked(shape)) return;
    const index = Number(handle.id);
    if (!Number.isInteger(index) || !shape.props.points[index]) return;
    const point = this.editor.inputs.shiftKey ? handle : snapCadHandle(this.editor, shape, handle);
    return { id: shape.id, type: shape.type, props: { points: shape.props.points.map((p, i) => i === index ? { x: point.x, y: point.y } : p) } };
  };
  override onResize: TLOnResizeHandler<CadPathShape> = (shape, { scaleX, scaleY }) => ({ props: {
    points: shape.props.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }))
  }, ...resizedPaint(shape, [scaleX, 0, 0, scaleY, 0, 0]) });
}
export class CadEllipseShapeUtil extends ShapeUtil<CadEllipseShape> {
  static override type = 'cad-ellipse' as const;
  static override props = { w: positive, h: positive, color: DefaultColorStyle };
  override getDefaultProps(): CadEllipseShape['props'] { return { w: 100, h: 100, color: 'black' }; }
  override getGeometry(shape: CadEllipseShape) { return new CadEllipseGeometry(shape.props.w, shape.props.h, this.editor.getShapePageTransform(shape).rotation(), cadShapePaint(shape)); }
  override component(shape: CadEllipseShape) { return <SVGContainer>{analyticArtwork(this.editor, shape)}</SVGContainer>; }
  override indicator(shape: CadEllipseShape) { return <ellipse cx={shape.props.w / 2} cy={shape.props.h / 2} rx={shape.props.w / 2} ry={shape.props.h / 2} />; }
  override toSvg(shape: CadEllipseShape) { return analyticArtwork(this.editor, shape, 'svg'); }
  override onResize: TLOnResizeHandler<CadEllipseShape> = (shape, info) => {
    const resized = resizeBox(shape, info, { minWidth: 1e-6, minHeight: 1e-6, maxWidth: CAD_MAX_COORDINATE, maxHeight: CAD_MAX_COORDINATE });
    const w = resized.props!.w!, h = resized.props!.h!;
    const sx = w / shape.props.w * (info.scaleX < 0 ? -1 : 1), sy = h / shape.props.h * (info.scaleY < 0 ? -1 : 1);
    return { ...resized, ...resizedPaint(shape, [sx, 0, 0, sy, sx < 0 ? w : 0, sy < 0 ? h : 0]) };
  };
}

export function cadArcPoints(props: CadArcShape['props']): CadPoint[] {
  const sweep = props.endAngle - props.startAngle;
  const count = Math.min(360, Math.max(2, Math.ceil(Math.abs(sweep) / 3)));
  const angles = Array.from({ length: count + 1 }, (_, i) => props.startAngle + sweep * i / count);
  // Exact cardinal extrema keep dimension bounds independent of hit-test sampling.
  for (let a = Math.ceil(props.startAngle / 90) * 90; a < props.endAngle && angles.length < 370; a += 90) angles.push(a);
  return [...new Set(angles)].sort((a, b) => a - b).map(degrees => {
    const angle = degrees * Math.PI / 180;
    return { x: props.radius * Math.cos(angle), y: -props.radius * Math.sin(angle) };
  });
}
export function cadArcPath(props: CadArcShape['props']): string {
  const a = props.startAngle * Math.PI / 180, b = props.endAngle * Math.PI / 180;
  return `M${props.radius * Math.cos(a)},${-props.radius * Math.sin(a)} A${props.radius},${props.radius} 0 ${props.endAngle - props.startAngle > 180 ? 1 : 0} 0 ${props.radius * Math.cos(b)},${-props.radius * Math.sin(b)}`;
}
export class CadArcShapeUtil extends ShapeUtil<CadArcShape> {
  static override type = 'cad-arc' as const;
  static override props = { radius: positive, startAngle: bounded, endAngle: bounded, color: DefaultColorStyle };
  override getDefaultProps(): CadArcShape['props'] { return { radius: 100, startAngle: 0, endAngle: 90, color: 'black' }; }
  override isAspectRatioLocked = () => true;
  // Endpoint handles can coincide with the bounding-box corners. Radius controls
  // and the numeric property bar provide scaling without intercepting endpoints.
  override hideResizeHandles = () => true;
  override hideRotateHandle = () => true;
  override hideSelectionBoundsFg = () => true;
  override getHandles(shape: CadArcShape): TLHandle[] {
    const { radius, startAngle, endAngle } = shape.props, indices = getIndices(3);
    return [startAngle, endAngle, (startAngle + endAngle) / 2].map((a, i) => ({
      id: ['start', 'end', 'radius'][i], type: 'vertex', index: indices[i], canSnap: false,
      x: radius * Math.cos(a * Math.PI / 180), y: -radius * Math.sin(a * Math.PI / 180)
    }));
  }
  override onHandleDrag: TLOnHandleDragHandler<CadArcShape> = (shape, { handle }) => {
    if (this.editor.getInstanceState().isReadonly || this.editor.isShapeOrAncestorLocked(shape)) return;
    const radius = Math.hypot(handle.x, handle.y);
    if (!Number.isFinite(radius) || radius < 1e-6 || radius > CAD_MAX_COORDINATE) return;
    if (handle.id === 'radius') return { id: shape.id, type: shape.type, props: { radius } };
    if (!['start', 'end'].includes(handle.id)) return;
    const norm = (a: number) => ((a % 360) + 360) % 360;
    let angle = norm(Math.atan2(-handle.y, handle.x) * 180 / Math.PI);
    if (this.editor.inputs.shiftKey) angle = norm(Math.round(angle / 15) * 15);
    const startAngle = handle.id === 'start' ? angle : norm(shape.props.startAngle);
    const sweep = norm((handle.id === 'end' ? angle : shape.props.endAngle) - startAngle);
    if (sweep < 1e-6 || sweep > 360 - 1e-6) return;
    return { id: shape.id, type: shape.type, props: { startAngle, endAngle: startAngle + sweep } };
  };
  override onResize: TLOnResizeHandler<CadArcShape> = (shape, { scaleX, scaleY }) => {
    const angle = scaleX * scaleY < 0 ? shape.props.endAngle : shape.props.startAngle;
    const radians = angle * Math.PI / 180;
    const startAngle = (Math.atan2(Math.sign(scaleY) * Math.sin(radians), Math.sign(scaleX) * Math.cos(radians)) * 180 / Math.PI + 360) % 360;
    return { props: { radius: shape.props.radius * Math.abs(scaleX), startAngle, endAngle: startAngle + shape.props.endAngle - shape.props.startAngle }, ...resizedPaint(shape, [scaleX, 0, 0, Math.sign(scaleY) * Math.abs(scaleX), 0, 0]) };
  };
  override getGeometry(shape: CadArcShape) { return new CadTransformGeometry({ children: [new Polyline2d({ points: vectors(cadArcPoints(shape.props)) })] }, cadPaintClipTest(cadShapePaint(shape))); }
  override component(shape: CadArcShape) { return <SVGContainer>{analyticArtwork(this.editor, shape)}</SVGContainer>; }
  override indicator(shape: CadArcShape) { return <path d={cadArcPath(shape.props)} />; }
  override toSvg(shape: CadArcShape) { return analyticArtwork(this.editor, shape, 'svg'); }
}

const dimensionLinkValidator = T.object({
  kind: T.literalEnum(...CAD_DIMENSION_KINDS),
  sourceIds: T.arrayOf(T.string.check(id => {
    if (!id.startsWith('shape:') || id.length > 128) throw new Error('Invalid dimension source');
  })).check(ids => {
    if (!ids.length || ids.length > CAD_DIMENSION_SOURCE_LIMIT || new Set(ids).size !== ids.length)
      throw new Error('Invalid dimension sources');
  }),
  path: T.optional(T.object({ vertices: T.number.check(count => {
    if (!Number.isInteger(count) || count < 2 || count > CAD_MAX_POINTS) throw new Error('Invalid dimension path');
  }), closed: T.boolean })),
});

function dimensionLayout(editor: Editor, shape: CadDimensionShape) {
  const { start, end, status, radialKind, angleSweep } = getDimensionEndpoints(editor, shape);
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy), divisor = length || 1;
  const normal = { x: -dy / divisor, y: dx / divisor };
  const { offset, decorationScale } = shape.props;
  const shift = (p: CadPoint, distance: number) => ({ x: p.x + normal.x * distance, y: p.y + normal.y * distance });
  const tick = 5 * decorationScale;
  if (angleSweep) {
    const from = Math.atan2(dy, dx);
    const radius = Math.max(8 * decorationScale, length + offset), segments = Math.ceil(Math.abs(angleSweep) / (Math.PI / 24));
    const at = (fraction: number, distance: number) => ({
      x: start.x + Math.cos(from + fraction * angleSweep) * distance,
      y: start.y + Math.sin(from + fraction * angleSweep) * distance,
    });
    const arc = Array.from({ length: segments + 1 }, (_, i) => at(i / segments, radius));
    const extension = Math.max(length, radius + tick);
    return { start, end, length, normal, status, radialKind, angleSweep, midpoint: at(0.5, radius),
      lines: [[start, at(0, extension)], [start, at(1, extension)], arc] };
  }
  if (radialKind) {
    const advance = (p: CadPoint, distance: number) => ({
      x: p.x + dx / divisor * distance, y: p.y + dy / divisor * distance,
    });
    const arrowLength = Math.min(7 * decorationScale, length / 4);
    const arrowAt = (tip: CadPoint, inward: number) => {
      const back = advance(tip, arrowLength * inward);
      return [shift(back, arrowLength / 2), tip, shift(back, -arrowLength / 2)];
    };
    const elbow = shift(advance(end, 12 * decorationScale), offset);
    const tail = advance(elbow, 16 * decorationScale);
    const other = radialKind === 'diameter' ? arrowAt(start, 1) : [shift(start, -tick), shift(start, tick)];
    return { start, end, length, normal, status, radialKind, angleSweep, midpoint: tail,
      lines: [[start, end], [end, elbow, tail], arrowAt(end, -1), other] };
  }
  const a = shift(start, offset), b = shift(end, offset);
  const extension = offset + Math.sign(offset) * 8 * decorationScale;
  return {
    start, end, length, normal, status, radialKind, angleSweep, midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    lines: [[start, shift(start, extension)], [end, shift(end, extension)], [a, b],
      [shift(a, -tick), shift(a, tick)], [shift(b, -tick), shift(b, tick)]],
  };
}
function DimensionSvg({ shape, editor }: { shape: CadDimensionShape; editor: Editor }) {
  const { label } = useCadText();
  const settings = useValue('CAD measurement settings', () => readCadSettings(editor), [editor]);
  const { length, lines, midpoint, status, radialKind, angleSweep } = useValue('CAD dimension geometry', () => dimensionLayout(editor, shape), [editor, shape]);
  const broken = status === 'broken';
  const ink = broken ? 'var(--status-warning, #b45309)' : color(editor, shape.props.color);
  const prefix = radialKind === 'radius' ? 'R ' : radialKind === 'diameter' ? 'Ø ' : '';
  const measurement = angleSweep ? `${(Math.abs(angleSweep) * 180 / Math.PI).toFixed(settings?.precision ?? 2)}°`
    : settings ? `${canvasLengthToUnit(length, settings).toFixed(settings.precision)} ${settings.unit}` : `${length.toFixed(2)} px`;
  const value = broken ? label('dimensionBroken') : prefix + measurement;
  return <g data-dimension-state={status} data-radial-dimension={radialKind ?? undefined} data-angular-dimension={angleSweep ? 'true' : undefined} fill="none" stroke={ink} strokeWidth={1}>
    {lines.map((points, i) => <path key={i} d={pathData(points, false)} strokeDasharray={broken ? '4 3' : undefined} />)}
    <text x={midpoint.x} y={midpoint.y - 6 * shape.props.decorationScale} textAnchor="middle" stroke="none" fill={ink} fontSize={14 * shape.props.decorationScale} fontFamily="sans-serif">{value}</text>
  </g>;
}
export class CadDimensionShapeUtil extends ShapeUtil<CadDimensionShape> {
  static override type = 'cad-dimension' as const;
  static override props = { endX: bounded, endY: bounded, offset: bounded, decorationScale: positive, color: DefaultColorStyle,
    link: T.optional(T.nullable(dimensionLinkValidator)), radialKind: T.optional(T.nullable(T.literalEnum(...CAD_RADIAL_DIMENSION_KINDS))),
    angleSweep: T.optional(T.nullable(T.number.check(value => {
      if (!Number.isFinite(value) || Math.abs(value) < 1e-8 || Math.abs(value) >= 2 * Math.PI)
        throw new Error('Invalid angle dimension sweep');
    }))) };
  override getDefaultProps(): CadDimensionShape['props'] { return { endX: 100, endY: 0, offset: 24, decorationScale: 1, color: 'blue' }; }
  override isAspectRatioLocked = () => true;
  override canResize = (shape: CadDimensionShape) => !shape.props.link;
  override hideResizeHandles = (shape: CadDimensionShape) => !!shape.props.link;
  override hideRotateHandle = (shape: CadDimensionShape) => !!shape.props.link;
  override onTranslate = (initial: CadDimensionShape) => initial.props.link ? { id: initial.id, type: initial.type, x: initial.x, y: initial.y } : undefined;
  override onResize: TLOnResizeHandler<CadDimensionShape> = (shape, { scaleX, scaleY }) => shape.props.link ? undefined : ({ props: {
    endX: shape.props.endX * scaleX, endY: shape.props.endY * scaleY,
    offset: shape.props.offset * Math.abs(scaleX) * (shape.props.angleSweep ? 1 : Math.sign(scaleX * scaleY)),
    ...(shape.props.angleSweep ? { angleSweep: shape.props.angleSweep * Math.sign(scaleX * scaleY) } : {}),
    decorationScale: shape.props.decorationScale * Math.abs(scaleX)
  } });
  override getGeometry(shape: CadDimensionShape) {
    return new CadTransformGeometry({ children: dimensionLayout(this.editor, shape).lines.map(points => new Polyline2d({ points: vectors(points) })) });
  }
  override component(shape: CadDimensionShape) { return <SVGContainer><DimensionSvg shape={shape} editor={this.editor} /></SVGContainer>; }
  override indicator(shape: CadDimensionShape) { return <path d={dimensionLayout(this.editor, shape).lines.map(p => pathData(p, false)).join(' ')} />; }
  override toSvg(shape: CadDimensionShape) { return <DimensionSvg shape={shape} editor={this.editor} />; }
  override getHandles(shape: CadDimensionShape): TLHandle[] {
    const { start, end, midpoint, status } = dimensionLayout(this.editor, shape);
    if (status === 'broken') return [];
    const indices = getIndices(3);
    const offset: TLHandle = { id: 'offset', ...midpoint, index: indices[2], type: 'vertex', canSnap: false };
    if (status === 'linked') return [offset];
    return [{ id: 'start', ...start, index: indices[0], type: 'vertex', canSnap: false },
      { id: 'end', ...end, index: indices[1], type: 'vertex', canSnap: false }, offset];
  }
  override onHandleDrag: TLOnHandleDragHandler<CadDimensionShape> = (shape, { handle }) => {
    if (this.editor.getInstanceState().isReadonly || this.editor.isShapeOrAncestorLocked(shape)) return;
    const { start, length, normal, status, angleSweep } = dimensionLayout(this.editor, shape);
    if (status === 'broken' || status === 'linked' && handle.id !== 'offset') return;
    if (handle.id === 'offset') {
      const x = handle.x - start.x, y = handle.y - start.y;
      const offset = angleSweep ? Math.hypot(x, y) - length : normal.x * x + normal.y * y;
      return { id: shape.id, type: shape.type, props: { offset } };
    }
    if (!this.editor.inputs.shiftKey) handle = { ...handle, ...snapCadHandle(this.editor, shape, handle) };
    if (handle.id === 'end') return { id: shape.id, type: shape.type, props: { endX: handle.x, endY: handle.y } };
    const c = Math.cos(shape.rotation), s = Math.sin(shape.rotation);
    return { id: shape.id, type: shape.type, x: shape.x + c * handle.x - s * handle.y, y: shape.y + s * handle.x + c * handle.y,
      props: { endX: shape.props.endX - handle.x, endY: shape.props.endY - handle.y } };
  };
}
