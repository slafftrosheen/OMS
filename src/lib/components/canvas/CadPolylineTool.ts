import { StateNode, createShapeId, DefaultColorStyle, type TLEventHandlers, type TLShapeId } from '@tldraw/tldraw';
import { CAD_MAX_POINTS, validCadPoint, type CadPoint } from './cad-settings';
import { snapCadPoint } from './cad-snap';

/** Click-based drafting: no freehand smoothing and no hidden coordinate quantization. */
export class CadPolylineTool extends StateNode {
  static override id = 'cad-polyline';
  private points: CadPoint[] = [];
  private shapeId: TLShapeId | null = null;
  private mark: string | null = null;
  override onEnter = () => {
    this.points = []; this.shapeId = null; this.mark = null;
    this.editor.selectNone(); this.editor.setCursor({ type: 'cross', rotation: 0 });
  };
  private pointer(): CadPoint {
    const raw = this.editor.inputs.currentPagePoint;
    let point = { x: raw.x, y: raw.y };
    const previous = this.points.at(-1);
    if (previous && this.editor.inputs.shiftKey) {
      const dx = point.x - previous.x, dy = point.y - previous.y;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
      const length = Math.hypot(dx, dy);
      point = { x: previous.x + length * Math.cos(angle), y: previous.y + length * Math.sin(angle) };
    }
    // Angle lock takes priority; ordinary clicks use the workspace Snap preference.
    return previous && this.editor.inputs.shiftKey ? point : snapCadPoint(this.editor, point, this.shapeId);
  }
  private render(preview?: CadPoint) {
    if (!this.shapeId || !this.points.length) return;
    const first = this.points[0], list = [...this.points];
    if (preview && validCadPoint({ x: preview.x - first.x, y: preview.y - first.y }) && Math.hypot(preview.x - list.at(-1)!.x, preview.y - list.at(-1)!.y) > 1e-8) list.push(preview);
    if (list.length === 1) list.push({ x: first.x + 1e-5, y: first.y });
    this.editor.updateShape({ id: this.shapeId, type: 'cad-path', props: { points: list.map(p => ({ x: p.x - first.x, y: p.y - first.y })) } });
  }
  override onPointerDown: TLEventHandlers['onPointerDown'] = info => {
    if (info.button !== 0) return;
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    const point = this.pointer();
    if (!validCadPoint(point)) return;
    if (this.points.length && !validCadPoint({ x: point.x - this.points[0].x, y: point.y - this.points[0].y })) return;
    if (this.points.length >= 3 && Math.hypot(point.x - this.points[0].x, point.y - this.points[0].y) * this.editor.getZoomLevel() <= 8) { this.finish(true); return; }
    if (this.points.length && Math.hypot(point.x - this.points.at(-1)!.x, point.y - this.points.at(-1)!.y) < 1e-6) return;
    if (!this.shapeId) {
      if (this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) return;
      this.shapeId = createShapeId(); this.mark = `cad-polyline-${this.shapeId}`;
      this.editor.mark(this.mark);
      this.editor.createShape({ id: this.shapeId, type: 'cad-path', parentId: this.editor.getCurrentPageId(), x: point.x, y: point.y,
        props: { points: [{ x: 0, y: 0 }, { x: 1e-5, y: 0 }], closed: false, color: this.editor.getStyleForNextShape(DefaultColorStyle) } });
    }
    this.points.push(point); this.render();
    if (this.points.length >= CAD_MAX_POINTS) this.finish(false);
  };
  override onPointerMove = () => {
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    const point = this.pointer();
    if (validCadPoint(point) && this.points.length < CAD_MAX_POINTS) this.render(point);
  };
  override onKeyDown: TLEventHandlers['onKeyDown'] = info => {
    if (info.key === 'Enter') this.finish(false);
    else if (info.key === 'Escape') this.cancel();
    else if (info.key === 'Backspace') {
      if (this.points.length <= 1) this.cancel();
      else { this.points.pop(); this.render(this.pointer()); }
    }
  };
  override onDoubleClick: TLEventHandlers['onDoubleClick'] = () => { this.finish(false); };
  override onComplete = () => { this.finish(false); };
  override onCancel = () => { this.cancel(); };
  override onInterrupt = () => { this.finish(false); };
  override onExit = () => { if (this.mark) this.finish(false, false); };
  private finish(closed: boolean, select = true) {
    const id = this.shapeId, mark = this.mark;
    if (this.editor.getInstanceState().isReadonly || this.points.length < (closed ? 3 : 2)) { this.cancel(select); return; }
    this.render();
    if (id) this.editor.updateShape({ id, type: 'cad-path', props: { closed } });
    this.mark = null; this.shapeId = null; this.points = [];
    if (mark) this.editor.mark(`${mark}-complete`);
    if (select) this.editor.setCurrentTool('select');
    if (id) this.editor.setSelectedShapes([id]);
  }
  private cancel(select = true) {
    const mark = this.mark;
    this.mark = null; this.shapeId = null; this.points = [];
    if (mark) this.editor.bailToMark(mark);
    if (select) this.editor.setCurrentTool('select');
  }
}
