import { StateNode, createShapeId, DefaultColorStyle, type JsonObject, type TLEventHandlers, type TLShapeId } from '@tldraw/tldraw';
import { registerCanvasDraft } from './canvas-document';
import { clearCadSnap, snapCadPoint } from './cad-snap';
import { CAD_MAX_COORDINATE, validCadPoint, type CadPoint } from './cad-settings';
import { tryNewCadOutlineMeta } from './drawing-outline-defaults';

export type CadBoxKind = 'rectangle' | 'ellipse' | 'pentagon' | 'star' | 'triangle' | 'diamond';
export function cadBoxGeometry(kind: CadBoxKind, start: CadPoint, end: CadPoint, square = false, centered = false) {
  if (!['rectangle', 'ellipse', 'pentagon', 'star', 'triangle', 'diamond'].includes(kind) || !validCadPoint(start) || !validCadPoint(end)) return null;
  let dx = end.x - start.x, dy = end.y - start.y;
  if (square) { const side = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * side; dy = (dy < 0 ? -1 : 1) * side; }
  const w = Math.abs(dx) * (centered ? 2 : 1), h = Math.abs(dy) * (centered ? 2 : 1);
  const x = centered ? start.x - w / 2 : Math.min(start.x, start.x + dx);
  const y = centered ? start.y - h / 2 : Math.min(start.y, start.y + dy);
  if (w < 1e-6 || h < 1e-6 || Math.max(w, h) > CAD_MAX_COORDINATE ||
      !validCadPoint({ x, y }) || !validCadPoint({ x: x + w, y: y + h })) return null;
  if (kind === 'ellipse') return { type: 'cad-ellipse' as const, x, y, props: { w, h } };
  let points = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  if (kind === 'triangle') points = [{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  else if (kind === 'diamond') points = [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }];
  else if (kind === 'pentagon' || kind === 'star') {
    const count = kind === 'star' ? 10 : 5;
    const vertices = Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / count, radius = kind === 'star' && i % 2 ? 0.5 : 1;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
    const minX = Math.min(...vertices.map(point => point.x)), maxX = Math.max(...vertices.map(point => point.x));
    const minY = Math.min(...vertices.map(point => point.y)), maxY = Math.max(...vertices.map(point => point.y));
    points = vertices.map(point => ({ x: (point.x - minX) / (maxX - minX) * w, y: (point.y - minY) / (maxY - minY) * h }));
  }
  return { type: 'cad-path' as const, x, y, props: { closed: true, points } };
}

/** Drag primitives retain editable CAD geometry and the page's outline. */
class CadBoxTool extends StateNode {
  protected kind: CadBoxKind = 'rectangle';
  private start: CadPoint | null = null;
  private pageId: string | null = null;
  private pointerId: number | null = null;
  private shapeId: TLShapeId | null = null;
  private mark: string | null = null;
  private outline: JsonObject | null = null;
  private clearDraft = () => {};
  override onEnter = () => {
    this.clearDraft(); this.clearDraft = registerCanvasDraft(this.editor, () => this.shapeId ? { id: this.shapeId, props: null } : null);
    this.start = null; this.shapeId = null; this.mark = null; this.pointerId = null; this.pageId = null; this.outline = null;
    clearCadSnap(this.editor); this.editor.selectNone(); this.editor.setCursor({ type: 'cross', rotation: 0 });
  };
  private available() { return !this.editor.getInstanceState().isReadonly && (!this.pageId || this.pageId === this.editor.getCurrentPageId()); }
  private pointer() {
    const point = this.editor.inputs.currentPagePoint;
    if (this.start && this.editor.inputs.shiftKey) { clearCadSnap(this.editor); return { x: point.x, y: point.y }; }
    return snapCadPoint(this.editor, point, this.shapeId);
  }
  private preview() {
    if (!this.start || !this.shapeId || !this.available()) return false;
    const geometry = cadBoxGeometry(this.kind, this.start, this.pointer(), this.editor.inputs.shiftKey, this.editor.inputs.altKey);
    if (!geometry) {
      if (this.editor.getShape(this.shapeId)) this.editor.deleteShapes([this.shapeId]);
      return false;
    }
    if (this.editor.getShape(this.shapeId)) this.editor.updateShape({ id: this.shapeId, ...geometry });
    else {
      if (this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) return false;
      this.editor.createShape({ id: this.shapeId, parentId: this.editor.getCurrentPageId(), ...geometry,
        props: { ...geometry.props, color: this.editor.getStyleForNextShape(DefaultColorStyle) }, meta: this.outline! });
    }
    return !!this.editor.getShape(this.shapeId);
  }
  override onPointerDown: TLEventHandlers['onPointerDown'] = info => {
    if (info.button !== 0 || this.start || !this.available()) return;
    const point = this.pointer();
    if (!validCadPoint(point) || this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) return;
    const meta = tryNewCadOutlineMeta(this.editor); if (!meta) return;
    this.start = point; this.pageId = this.editor.getCurrentPageId(); this.pointerId = info.pointerId;
    this.outline = meta;
    this.shapeId = createShapeId(); this.mark = `cad-box-${this.shapeId}`; this.editor.mark(this.mark);
  };
  override onPointerMove: TLEventHandlers['onPointerMove'] = info => {
    if (!this.available()) { this.cancel(); return; }
    if (!this.start) { this.pointer(); return; }
    if (this.pointerId === info.pointerId) this.preview();
  };
  override onPointerUp: TLEventHandlers['onPointerUp'] = info => {
    if (!this.start || info.pointerId !== this.pointerId) return;
    if (!this.available() || !this.preview()) { this.cancel(); return; }
    const id = this.shapeId, mark = this.mark;
    this.clearDraft(); clearCadSnap(this.editor);
    this.start = null; this.shapeId = null; this.mark = null; this.pointerId = null; this.pageId = null; this.outline = null;
    this.editor.setCurrentTool('select');
    if (id) this.editor.setSelectedShapes([id]);
    if (mark) this.editor.mark(`${mark}-complete`);
  };
  override onKeyDown: TLEventHandlers['onKeyDown'] = info => {
    if (!this.available() || info.key === 'Escape') this.cancel();
    else if (this.start && ['Shift', 'Alt'].includes(info.key)) this.preview();
  };
  override onKeyUp: TLEventHandlers['onKeyUp'] = info => {
    if (!this.available()) this.cancel();
    else if (this.start && ['Shift', 'Alt'].includes(info.key)) this.preview();
  };
  override onCancel = () => this.cancel();
  override onComplete = () => this.cancel();
  override onInterrupt = () => this.cancel();
  override onExit = () => this.cancel(false);
  private cancel(select = true) {
    this.clearDraft(); clearCadSnap(this.editor);
    const mark = this.mark;
    this.start = null; this.shapeId = null; this.mark = null; this.pointerId = null; this.pageId = null; this.outline = null;
    if (mark) this.editor.bailToMark(mark);
    if (select) this.editor.setCurrentTool('select');
  }
}
export class CadRectangleTool extends CadBoxTool { static override id = 'cad-rectangle'; }
export class CadEllipseTool extends CadBoxTool { static override id = 'cad-ellipse'; protected override kind = 'ellipse' as const; }
export class CadPentagonTool extends CadBoxTool { static override id = 'cad-pentagon'; protected override kind = 'pentagon' as const; }
export class CadStarTool extends CadBoxTool { static override id = 'cad-star'; protected override kind = 'star' as const; }
export class CadTriangleTool extends CadBoxTool { static override id = 'cad-triangle'; protected override kind = 'triangle' as const; }
export class CadDiamondTool extends CadBoxTool { static override id = 'cad-diamond'; protected override kind = 'diamond' as const; }
