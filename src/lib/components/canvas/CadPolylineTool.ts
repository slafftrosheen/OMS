import { StateNode, createShapeId, DefaultColorStyle, type TLEventHandlers, type TLShapeId } from '@tldraw/tldraw';
import { CAD_MAX_POINTS, validCadPoint, type CadPoint } from './cad-settings';
import { clearCadSnap, snapCadPoint } from './cad-snap';
import { polylineSession } from './cad-polyline-draft';

/** Click-based drafting: no freehand smoothing and no hidden coordinate quantization. */
export class CadPolylineTool extends StateNode {
  static override id = 'cad-polyline';
  private points: CadPoint[] = [];
  private shapeId: TLShapeId | null = null;
  private mark: string | null = null;
  override onEnter = () => {
    clearCadSnap(this.editor); this.points = []; this.shapeId = null; this.mark = null;
    this.editor.selectNone(); this.editor.setCursor({ type: 'cross', rotation: 0 });
    polylineSession(this.editor).controller = { add: point => this.addPoint(point), finish: closed => this.finish(closed), back: () => this.back(), cancel: () => this.cancel() };
    this.publish();
  };
  private publish(pointer: CadPoint | null = null) { polylineSession(this.editor).state.set({ points: this.points.map(p => ({ ...p })), pointer }); }
  private clearSession() { clearCadSnap(this.editor); const session = polylineSession(this.editor); session.state.set(null); session.controller = null; }
  private pointer(): CadPoint {
    const raw = this.editor.inputs.currentPagePoint;
    let point = { x: raw.x, y: raw.y };
    const previous = this.points.at(-1);
    if (previous && this.editor.inputs.shiftKey) {
      clearCadSnap(this.editor);
      const dx = point.x - previous.x, dy = point.y - previous.y;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
      const length = Math.hypot(dx, dy);
      point = { x: previous.x + length * Math.cos(angle), y: previous.y + length * Math.sin(angle) };
    }
    // Angle lock takes priority; ordinary clicks use the workspace Snap preference.
    return previous && this.editor.inputs.shiftKey ? point : snapCadPoint(this.editor, point, this.shapeId);
  }
  private render(preview?: CadPoint) {
    this.publish(preview ?? null);
    if (!this.shapeId || !this.points.length) return;
    const first = this.points[0], list = [...this.points];
    if (preview && validCadPoint({ x: preview.x - first.x, y: preview.y - first.y }) && Math.hypot(preview.x - list.at(-1)!.x, preview.y - list.at(-1)!.y) > 1e-8) list.push(preview);
    if (list.length === 1) list.push({ x: first.x + 1e-5, y: first.y });
    this.editor.updateShape({ id: this.shapeId, type: 'cad-path', props: { points: list.map(p => ({ x: p.x - first.x, y: p.y - first.y })) } });
  }
  override onPointerDown: TLEventHandlers['onPointerDown'] = info => {
    if (info.button !== 0) return;
    const point = this.pointer();
    if (this.points.length >= 3 && validCadPoint(point) && Math.hypot(point.x - this.points[0].x, point.y - this.points[0].y) * this.editor.getZoomLevel() <= 8) { this.finish(true); return; }
    this.addPoint(point);
  };
  private addPoint(point: CadPoint): boolean {
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return false; }
    if (!validCadPoint(point)) return false;
    if (this.points.length && !validCadPoint({ x: point.x - this.points[0].x, y: point.y - this.points[0].y })) return false;
    if (this.points.length && Math.hypot(point.x - this.points.at(-1)!.x, point.y - this.points.at(-1)!.y) < 1e-6) return false;
    if (!this.shapeId) {
      if (this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) return false;
      this.shapeId = createShapeId(); this.mark = `cad-polyline-${this.shapeId}`;
      this.editor.mark(this.mark);
      this.editor.createShape({ id: this.shapeId, type: 'cad-path', parentId: this.editor.getCurrentPageId(), x: point.x, y: point.y,
        props: { points: [{ x: 0, y: 0 }, { x: 1e-5, y: 0 }], closed: false, color: this.editor.getStyleForNextShape(DefaultColorStyle) } });
      if (!this.editor.getShape(this.shapeId)) { this.cancel(); return false; }
    }
    this.points.push(point); this.render();
    if (this.points.length >= CAD_MAX_POINTS) this.finish(false);
    return true;
  }
  override onPointerMove = () => {
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    const point = this.pointer();
    if (validCadPoint(point) && this.points.length < CAD_MAX_POINTS) this.render(point);
  };
  override onKeyDown: TLEventHandlers['onKeyDown'] = info => {
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    if (info.key === 'Enter') this.finish(false);
    else if (info.key === 'Escape') this.cancel();
    else if (info.key === 'Backspace') this.back();
  };
  private back() {
    if (this.editor.getInstanceState().isReadonly || this.points.length <= 1) this.cancel();
    else { this.points.pop(); this.render(); }
  }
  override onDoubleClick: TLEventHandlers['onDoubleClick'] = () => { this.finish(false); };
  override onComplete = () => { this.finish(false); };
  override onCancel = () => { this.cancel(); };
  override onInterrupt = () => { this.finish(false); };
  override onExit = () => { if (this.mark) this.finish(false, false); this.clearSession(); };
  private finish(closed: boolean, select = true): boolean {
    const id = this.shapeId, mark = this.mark;
    if (this.editor.getInstanceState().isReadonly || this.points.length < (closed ? 3 : 2)) { this.cancel(select); return false; }
    // Explicit numeric entry can return to the start. Closing uses one seam node.
    if (closed && Math.hypot(this.points[0].x - this.points.at(-1)!.x, this.points[0].y - this.points.at(-1)!.y) < 1e-6) {
      if (this.points.length < 4) return false;
      this.points.pop();
    }
    this.render();
    if (id) this.editor.updateShape({ id, type: 'cad-path', props: { closed } });
    this.mark = null; this.shapeId = null; this.points = [];
    this.clearSession();
    if (select) this.editor.setCurrentTool('select');
    if (id) this.editor.setSelectedShapes([id]);
    if (mark) this.editor.mark(`${mark}-complete`);
    return true;
  }
  private cancel(select = true) {
    const mark = this.mark;
    this.mark = null; this.shapeId = null; this.points = [];
    this.clearSession();
    if (mark) this.editor.bailToMark(mark);
    if (select) this.editor.setCurrentTool('select');
  }
}
