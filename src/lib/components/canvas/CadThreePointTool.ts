import { StateNode, createShapeId, DefaultColorStyle, type TLEventHandlers, type TLShapeId } from '@tldraw/tldraw';
import { validCadPoint, type CadPoint } from './cad-settings';
import { snapCadPoint } from './cad-snap';
import { cadConstruction, threePointGeometry } from './cad-construction';

class CadThreePointTool extends StateNode {
  protected kind: 'arc' | 'circle' = 'arc';
  private points: CadPoint[] = [];
  private shapeId: TLShapeId | null = null;
  private mark: string | null = null;
  override onEnter = () => {
    this.points = []; this.shapeId = null; this.mark = null;
    this.editor.selectNone(); this.editor.setCursor({ type: 'cross', rotation: 0 }); this.publish(null, false);
  };
  private publish(pointer: CadPoint | null, valid: boolean) {
    cadConstruction(this.editor).set({ kind: this.kind, points: [...this.points], pointer, valid });
  }
  private pointer() { return snapCadPoint(this.editor, this.editor.inputs.currentPagePoint, this.shapeId); }
  private preview(point: CadPoint) {
    const geometry = this.points.length === 2 ? threePointGeometry(this.kind, this.points[0], this.points[1], point) : null;
    if (geometry && this.shapeId) {
      if (this.editor.getShape(this.shapeId)) this.editor.updateShape({ id: this.shapeId, ...geometry });
      else this.editor.createShape({ id: this.shapeId, parentId: this.editor.getCurrentPageId(), ...geometry,
        props: { ...geometry.props, color: this.editor.getStyleForNextShape(DefaultColorStyle) } });
    } else if (this.shapeId && this.editor.getShape(this.shapeId)) this.editor.deleteShapes([this.shapeId]);
    const valid = !!geometry && !!this.shapeId && !!this.editor.getShape(this.shapeId);
    this.publish(point, valid); return valid;
  }
  override onPointerDown: TLEventHandlers['onPointerDown'] = info => {
    if (info.button !== 0) return;
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    const point = this.pointer(); if (!validCadPoint(point)) return;
    if (this.points.length === 2) { if (this.preview(point)) this.finish(); return; }
    if (this.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 1e-6)) return;
    if (!this.shapeId) {
      if (this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) return;
      this.shapeId = createShapeId(); this.mark = `cad-three-point-${this.shapeId}`; this.editor.mark(this.mark);
    }
    this.points.push(point); this.publish(point, false);
  };
  override onPointerMove = () => { if (this.editor.getInstanceState().isReadonly) this.cancel(); else this.preview(this.pointer()); };
  override onKeyDown: TLEventHandlers['onKeyDown'] = info => {
    if (this.editor.getInstanceState().isReadonly) { this.cancel(); return; }
    if (info.key === 'Escape') this.cancel();
    else if (info.key === 'Enter' && this.preview(this.pointer())) this.finish();
    else if (info.key === 'Backspace') { if (!this.points.length) this.cancel(); else { this.points.pop(); this.preview(this.pointer()); } }
  };
  override onCancel = () => this.cancel();
  override onComplete = () => this.cancel();
  override onInterrupt = () => this.cancel();
  override onExit = () => this.cancel(false);
  private finish() {
    const id = this.shapeId, mark = this.mark;
    this.shapeId = null; this.mark = null; this.points = []; cadConstruction(this.editor).set(null);
    this.editor.setCurrentTool('select'); if (id) this.editor.setSelectedShapes([id]); if (mark) this.editor.mark(`${mark}-complete`);
  }
  private cancel(select = true) {
    const mark = this.mark; this.mark = null; this.shapeId = null; this.points = []; cadConstruction(this.editor).set(null);
    if (mark) this.editor.bailToMark(mark); if (select) this.editor.setCurrentTool('select');
  }
}
export class CadArcThreePointTool extends CadThreePointTool { static override id = 'cad-arc-three'; }
export class CadCircleThreePointTool extends CadThreePointTool { static override id = 'cad-circle-three'; protected override kind = 'circle' as const; }
