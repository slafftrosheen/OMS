import { StateNode, createShapeId, DefaultColorStyle, type TLEventHandlers, type TLShapeId } from '@tldraw/tldraw';
import { registerCanvasDraft } from './canvas-document';
import { angleDimensionAt } from './cad-dimension-links';
import { cadConstruction } from './cad-construction';
import { CAD_MAX_COORDINATE, validCadPoint, type CadPoint } from './cad-settings';
import { clearCadSnap, snapCadPoint } from './cad-snap';
import { dimensionAngularOffset, dimensionCreationStyle, dimensionStyleForCreation, readDimensionDefaults,
  type CadDimensionDefaults, type DimensionCreationStyle } from './cad-dimension-defaults';
import { dimensionCreationInsideLimits, dimensionCreationMatches } from './cad-dimension-creation';

/** Vertex, point on first ray, point on second ray. The default sector is 0–180°. */
export function angularDimensionGeometry(vertex: CadPoint, first: CadPoint, second: CadPoint, zoom = 1,
  style?: DimensionCreationStyle | null, mode: CadDimensionDefaults['mode'] = 'view') {
  const points = angleDimensionAt(vertex, first, second);
  const annotation = style === undefined ? dimensionStyleForCreation(zoom) : style;
  if (!points || !annotation || !Number.isFinite(zoom) || zoom <= 0) return null;
  const endX = points.end.x - vertex.x, endY = points.end.y - vertex.y;
  const length = Math.hypot(endX, endY);
  const offset = dimensionAngularOffset(length, annotation, mode);
  if (offset === null) return null;
  const radius = length + offset, { decorationScale } = annotation;
  const extent = Math.max(length, radius + 5 * decorationScale) + 40 * decorationScale;
  if (!Number.isFinite(extent) || decorationScale > CAD_MAX_COORDINATE ||
      !validCadPoint({ x: vertex.x - extent, y: vertex.y - extent }) || !validCadPoint({ x: vertex.x + extent, y: vertex.y + extent })) return null;
  return {
    type: 'cad-dimension' as const, x: vertex.x, y: vertex.y,
    props: { ...annotation, endX, endY, angleSweep: points.angleSweep!, offset },
  };
}

export class CadAngularDimensionTool extends StateNode {
  static override id = 'cad-dimension-angular';
  private points: CadPoint[] = [];
  private shapeId: TLShapeId | null = null;
  private mark: string | null = null;
  private pageId: string | null = null;
  private clearDraft: () => void = () => {};

  override onEnter = () => {
    this.clearDraft();
    this.clearDraft = registerCanvasDraft(this.editor, () => this.shapeId ? { id: this.shapeId, props: null } : null);
    clearCadSnap(this.editor); this.points = []; this.shapeId = null; this.mark = null; this.pageId = null;
    this.editor.selectNone(); this.editor.setCursor({ type: 'cross', rotation: 0 }); this.publish(null, false);
  };
  private publish(pointer: CadPoint | null, valid: boolean) {
    cadConstruction(this.editor).set({ kind: 'angle', points: [...this.points], pointer, valid });
  }
  private pointer(): CadPoint {
    const raw = this.editor.inputs.currentPagePoint, vertex = this.points[0];
    if (vertex && this.editor.inputs.shiftKey) {
      clearCadSnap(this.editor);
      const dx = raw.x - vertex.x, dy = raw.y - vertex.y, length = Math.hypot(dx, dy);
      const base = this.points.length === 2 ? Math.atan2(this.points[1].y - vertex.y, this.points[1].x - vertex.x) : 0;
      const angle = base + Math.round((Math.atan2(dy, dx) - base) / (Math.PI / 12)) * Math.PI / 12;
      return { x: vertex.x + length * Math.cos(angle), y: vertex.y + length * Math.sin(angle) };
    }
    return snapCadPoint(this.editor, raw, this.shapeId, vertex ?? null);
  }
  private preview(pointer: CadPoint): boolean {
    if (this.pageId && this.pageId !== this.editor.getCurrentPageId()) { this.cancel(); return false; }
    const geometry = this.points.length === 2 ? angularDimensionGeometry(this.points[0], this.points[1], pointer, this.editor.getZoomLevel(),
      dimensionCreationStyle(this.editor), readDimensionDefaults(this.editor).mode) : null;
    try {
      if (geometry && this.shapeId && dimensionCreationInsideLimits(this.editor, geometry)) {
        const requested = { id: this.shapeId, parentId: this.editor.getCurrentPageId(), ...geometry,
          props: { ...geometry.props, color: this.editor.getStyleForNextShape(DefaultColorStyle) } };
        if (this.editor.getShape(this.shapeId)) this.editor.updateShape(requested);
        else this.editor.createShape(requested);
        if (!dimensionCreationMatches(this.editor, requested)) throw new Error('Angle preview was refused or changed');
        this.publish(pointer, true); return true;
      }
      if (this.shapeId && this.editor.getShape(this.shapeId)) {
        this.editor.deleteShapes([this.shapeId]);
        if (this.editor.getShape(this.shapeId)) throw new Error('Angle preview removal was refused');
      }
      this.publish(pointer, false); return false;
    } catch { this.cancel(); return false; }
  }
  override onPointerDown: TLEventHandlers['onPointerDown'] = info => {
    if (info.button !== 0) return;
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    const point = this.pointer(); if (!validCadPoint(point)) return;
    if (this.points.length === 2) { if (this.preview(point)) this.finish(); return; }
    if (this.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 1e-6)) return;
    if (!this.shapeId) {
      if (this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) return;
      this.shapeId = createShapeId(); this.pageId = this.editor.getCurrentPageId(); this.mark = `cad-angle-${this.shapeId}`; this.editor.mark(this.mark);
    }
    this.points.push(point); this.publish(point, false);
  };
  override onPointerMove = () => { if (this.editor.getInstanceState().isReadonly) this.cancel(); else this.preview(this.pointer()); };
  override onKeyDown: TLEventHandlers['onKeyDown'] = info => {
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    if (info.key === 'Escape') this.cancel();
    else if (info.key === 'Enter' && this.preview(this.pointer())) this.finish();
    else if (info.key === 'Backspace') {
      if (!this.points.length) this.cancel();
      else { this.points.pop(); this.preview(this.pointer()); }
    }
  };
  override onCancel = () => this.cancel();
  override onComplete = () => this.cancel();
  override onInterrupt = () => this.cancel();
  override onExit = () => this.cancel(false);
  private finish() {
    this.clearDraft(); clearCadSnap(this.editor);
    const id = this.shapeId, mark = this.mark;
    this.shapeId = null; this.mark = null; this.pageId = null; this.points = []; cadConstruction(this.editor).set(null);
    this.editor.setCurrentTool('select'); if (id) this.editor.setSelectedShapes([id]); if (mark) this.editor.mark(`${mark}-complete`);
  }
  private cancel(select = true) {
    this.clearDraft(); clearCadSnap(this.editor);
    const mark = this.mark; this.mark = null; this.shapeId = null; this.pageId = null; this.points = []; cadConstruction(this.editor).set(null);
    if (mark) this.editor.bailToMark(mark); if (select) this.editor.setCurrentTool('select');
  }
}
