import {snapCadHandle} from '../cad-snap';
import { vectorPaint } from '../cad-vector';
import React from 'react';
import { ShapeUtil, SVGContainer, Polyline2d, Polygon2d, Ellipse2d, Group2d, Box, Vec, T,
  DefaultColorStyle, getDefaultColorTheme, getIndices, resizeBox, useValue, type Editor, type TLBaseShape,
  type TLDefaultColorStyle, type TLHandle, type TLOnHandleDragHandler, type TLOnResizeHandler } from '@tldraw/tldraw';
import { CAD_MAX_COORDINATE, CAD_MAX_POINTS, canvasLengthToUnit, readCadSettings, type CadPoint } from '../cad-settings';

const bounded = T.number.check(n => { if (!Number.isFinite(n) || Math.abs(n) > CAD_MAX_COORDINATE) throw new Error('CAD coordinate out of bounds'); });
const positive = bounded.check(n => { if (n <= 0) throw new Error('Positive CAD size required'); });
const pointsValidator = T.arrayOf(T.object({ x: bounded, y: bounded })).check(p => {
  if (p.length < 2 || p.length > CAD_MAX_POINTS) throw new Error('CAD contour needs 2–256 nodes');
});
export type CadPathShape = TLBaseShape<'cad-path', { points: CadPoint[]; closed: boolean; color: TLDefaultColorStyle }>;
export type CadEllipseShape = TLBaseShape<'cad-ellipse', { w: number; h: number; color: TLDefaultColorStyle }>;
export type CadArcShape = TLBaseShape<'cad-arc', { radius: number; startAngle: number; endAngle: number; color: TLDefaultColorStyle }>;
export type CadDimensionShape = TLBaseShape<'cad-dimension', { endX: number; endY: number; offset: number; decorationScale: number; color: TLDefaultColorStyle }>;
const vectors = (points: CadPoint[]) => points.map(p => new Vec(p.x, p.y));
function pathData(points: CadPoint[], closed: boolean) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + (closed ? ' Z' : ''); }
function color(editor: Editor, value: TLDefaultColorStyle) { return getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })[value].solid; }

/** Native rotated resize assumes the page bounds centre is the transformed local
 * bounds centre. Use a rectangular transform envelope while retaining child
 * geometry for hit testing; physical measurements use cad-bounds, never this envelope. */
class CadTransformGeometry extends Group2d {
  override getVertices() { return Box.Common(this.children.map(child => child.bounds)).corners; }
}

class CadEllipseGeometry extends Ellipse2d {
  constructor(w: number, h: number, private pageRotation: number) { super({ width: w, height: h, isFilled: false }); }
  override getVertices() {
    const rx = this.w / 2, ry = this.h / 2, c = Math.cos(this.pageRotation), s = Math.sin(this.pageRotation);
    const x = Math.atan2(-ry * s, rx * c), y = Math.atan2(ry * c, rx * s);
    const angles = [...Array.from({ length: 120 }, (_, i) => i * Math.PI / 60), x, x + Math.PI, y, y + Math.PI];
    return angles.map(a => (a + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b)
      .map(a => new Vec(rx + rx * Math.cos(a), ry + ry * Math.sin(a)));
  }
}

export class CadPathShapeUtil extends ShapeUtil<CadPathShape> {
  static override type = 'cad-path' as const;
  static override props = { points: pointsValidator, closed: T.boolean, color: DefaultColorStyle };
  override getDefaultProps(): CadPathShape['props'] { return { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false, color: 'black' }; }
  override getGeometry(shape: CadPathShape) {
    return new CadTransformGeometry({ children: [shape.props.closed ? new Polygon2d({ points: vectors(shape.props.points), isFilled: false }) : new Polyline2d({ points: vectors(shape.props.points) })] });
  }
  override component(shape: CadPathShape) { return <SVGContainer><path d={pathData(shape.props.points, shape.props.closed)} fill="none" stroke={shape.meta.omsVectorPaint ? vectorPaint(shape.meta).stroke : color(this.editor, shape.props.color)} strokeWidth={1} /></SVGContainer>; }
  override indicator(shape: CadPathShape) { return <path d={pathData(shape.props.points, shape.props.closed)} />; }
  override toSvg(shape: CadPathShape) { return <path d={pathData(shape.props.points, shape.props.closed)} fill="none" stroke={shape.meta.omsVectorPaint ? vectorPaint(shape.meta).stroke : color(this.editor, shape.props.color)} strokeWidth={1} />; }
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
  } });
}
export class CadEllipseShapeUtil extends ShapeUtil<CadEllipseShape> {
  static override type = 'cad-ellipse' as const;
  static override props = { w: positive, h: positive, color: DefaultColorStyle };
  override getDefaultProps(): CadEllipseShape['props'] { return { w: 100, h: 100, color: 'black' }; }
  override getGeometry(shape: CadEllipseShape) { return new CadEllipseGeometry(shape.props.w, shape.props.h, this.editor.getShapePageTransform(shape).rotation()); }
  private ellipse(shape: CadEllipseShape, indicator = false) { return <ellipse cx={shape.props.w / 2} cy={shape.props.h / 2} rx={shape.props.w / 2} ry={shape.props.h / 2}
    {...(indicator ? {} : { fill: 'none', stroke: shape.meta.omsVectorPaint ? vectorPaint(shape.meta).stroke : color(this.editor, shape.props.color), strokeWidth: 1 })} />; }
  override component(shape: CadEllipseShape) { return <SVGContainer>{this.ellipse(shape)}</SVGContainer>; }
  override indicator(shape: CadEllipseShape) { return this.ellipse(shape, true); }
  override toSvg(shape: CadEllipseShape) { return this.ellipse(shape); }
  override onResize: TLOnResizeHandler<CadEllipseShape> = (shape, info) => resizeBox(shape, info, { minWidth: 1e-6, minHeight: 1e-6, maxWidth: CAD_MAX_COORDINATE, maxHeight: CAD_MAX_COORDINATE });
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
    return { props: { radius: shape.props.radius * Math.abs(scaleX), startAngle, endAngle: startAngle + shape.props.endAngle - shape.props.startAngle } };
  };
  override getGeometry(shape: CadArcShape) { return new CadTransformGeometry({ children: [new Polyline2d({ points: vectors(cadArcPoints(shape.props)) })] }); }
  override component(shape: CadArcShape) { return <SVGContainer><path d={cadArcPath(shape.props)} fill="none" stroke={shape.meta.omsVectorPaint ? vectorPaint(shape.meta).stroke : color(this.editor, shape.props.color)} strokeWidth={1} /></SVGContainer>; }
  override indicator(shape: CadArcShape) { return <path d={cadArcPath(shape.props)} />; }
  override toSvg(shape: CadArcShape) { return <path d={cadArcPath(shape.props)} fill="none" stroke={shape.meta.omsVectorPaint ? vectorPaint(shape.meta).stroke : color(this.editor, shape.props.color)} strokeWidth={1} />; }
}

function dimensionLines(shape: CadDimensionShape): CadPoint[][] {
  const { endX: x, endY: y, offset } = shape.props;
  const length = Math.hypot(x, y) || 1;
  const n = { x: -y / length, y: x / length }, a = { x: n.x * offset, y: n.y * offset }, b = { x: x + a.x, y: y + a.y };
  const tick = 5 * shape.props.decorationScale;
  const extension = Math.sign(offset) * 8 * shape.props.decorationScale;
  return [[{ x: 0, y: 0 }, { x: a.x + n.x * extension, y: a.y + n.y * extension }], [{ x, y }, { x: b.x + n.x * extension, y: b.y + n.y * extension }], [a, b],
    [{ x: a.x - n.x * tick, y: a.y - n.y * tick }, { x: a.x + n.x * tick, y: a.y + n.y * tick }],
    [{ x: b.x - n.x * tick, y: b.y - n.y * tick }, { x: b.x + n.x * tick, y: b.y + n.y * tick }]];
}
function DimensionSvg({ shape, editor }: { shape: CadDimensionShape; editor: Editor }) {
  const settings = useValue('CAD measurement settings', () => readCadSettings(editor), [editor]);
  const length = Math.hypot(shape.props.endX, shape.props.endY);
  const label = settings ? `${canvasLengthToUnit(length, settings).toFixed(settings.precision)} ${settings.unit}` : `${length.toFixed(2)} px`;
  const lines = dimensionLines(shape), [a, b] = lines[2];
  return <g fill="none" stroke={color(editor, shape.props.color)} strokeWidth={1}>
    {lines.map((points, i) => <path key={i} d={pathData(points, false)} />)}
    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6 * shape.props.decorationScale} textAnchor="middle" stroke="none" fill={color(editor, shape.props.color)} fontSize={14 * shape.props.decorationScale} fontFamily="sans-serif">{label}</text>
  </g>;
}
export class CadDimensionShapeUtil extends ShapeUtil<CadDimensionShape> {
  static override type = 'cad-dimension' as const;
  static override props = { endX: bounded, endY: bounded, offset: bounded, decorationScale: positive, color: DefaultColorStyle };
  override getDefaultProps(): CadDimensionShape['props'] { return { endX: 100, endY: 0, offset: 24, decorationScale: 1, color: 'blue' }; }
  override isAspectRatioLocked = () => true;
  override onResize: TLOnResizeHandler<CadDimensionShape> = (shape, { scaleX, scaleY }) => ({ props: {
    endX: shape.props.endX * scaleX, endY: shape.props.endY * scaleY,
    offset: shape.props.offset * Math.abs(scaleX) * Math.sign(scaleX * scaleY),
    decorationScale: shape.props.decorationScale * Math.abs(scaleX)
  } });
  override getGeometry(shape: CadDimensionShape) { return new CadTransformGeometry({ children: dimensionLines(shape).map(points => new Polyline2d({ points: vectors(points) })) }); }
  override component(shape: CadDimensionShape) { return <SVGContainer><DimensionSvg shape={shape} editor={this.editor} /></SVGContainer>; }
  override indicator(shape: CadDimensionShape) { return <path d={dimensionLines(shape).map(p => pathData(p, false)).join(' ')} />; }
  override toSvg(shape: CadDimensionShape) { return <DimensionSvg shape={shape} editor={this.editor} />; }
  override getHandles(shape: CadDimensionShape): TLHandle[] {
    const indices = getIndices(3), { endX, endY, offset } = shape.props, length = Math.hypot(endX, endY) || 1;
    return [{ id: 'start', x: 0, y: 0, index: indices[0], type: 'vertex', canSnap: false },
      { id: 'end', x: endX, y: endY, index: indices[1], type: 'vertex', canSnap: false },
      { id: 'offset', x: endX / 2 - endY / length * offset, y: endY / 2 + endX / length * offset, index: indices[2], type: 'vertex', canSnap: false }];
  }
  override onHandleDrag: TLOnHandleDragHandler<CadDimensionShape> = (shape, { handle }) => {
    if (this.editor.getInstanceState().isReadonly || this.editor.isShapeOrAncestorLocked(shape)) return;
    if (handle.id !== 'offset' && !this.editor.inputs.shiftKey) handle = { ...handle, ...snapCadHandle(this.editor, shape, handle) };
    if (handle.id === 'end') return { id: shape.id, type: shape.type, props: { endX: handle.x, endY: handle.y } };
    if (handle.id === 'offset') {
      const { endX, endY } = shape.props, length = Math.hypot(endX, endY) || 1;
      return { id: shape.id, type: shape.type, props: { offset: (-endY * handle.x + endX * handle.y) / length } };
    }
    const c = Math.cos(shape.rotation), s = Math.sin(shape.rotation);
    return { id: shape.id, type: shape.type, x: shape.x + c * handle.x - s * handle.y, y: shape.y + s * handle.x + c * handle.y,
      props: { endX: shape.props.endX - handle.x, endY: shape.props.endY - handle.y } };
  };
}
