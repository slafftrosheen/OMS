import { StateNode, createShapeId, DefaultColorStyle, type TLEventHandlers, type TLShapeId } from '@tldraw/tldraw';
import { nodeAt, validContours, type CadBezierNode } from './cad-curves';
import { validCadPoint } from './cad-settings';
import { clearCadSnap, snapCadPoint } from './cad-snap';

/** Click for corners; drag from the new anchor for symmetric Bézier handles. */
export class CadBezierTool extends StateNode {
  static override id = 'cad-bezier';
  private nodes: CadBezierNode[] = [];
  private shapeId: TLShapeId | null = null;
  private mark: string | null = null;
  private dragging = false;
  override onEnter = () => {
    clearCadSnap(this.editor);
    this.nodes = [];
    this.shapeId = null;
    this.mark = null;
    this.dragging = false;
    this.editor.selectNone();
    this.editor.setCursor({ type: 'cross', rotation: 0 });
  };
  private render(closed = false) {
    if (!this.shapeId || !this.nodes.length) return;
    const nodes =
      this.nodes.length === 1 ? [...this.nodes, nodeAt({ x: this.nodes[0].x + 1e-5, y: this.nodes[0].y })] : this.nodes;
    this.editor.updateShape({
      id: this.shapeId,
      type: 'cad-bezier',
      props: { contours: [{ closed, nodes: structuredClone(nodes) }] }
    });
  }
  override onPointerDown: TLEventHandlers['onPointerDown'] = (info) => {
    if (info.button !== 0) return;
    if (this.editor.getInstanceState().isReadonly) {
      this.cancel();
      return;
    }
    const point = snapCadPoint(this.editor, this.editor.inputs.currentPagePoint, this.shapeId);
    if (!validCadPoint(point)) return;
    if (
      this.nodes.length >= 2 &&
      Math.hypot(point.x - this.nodes[0].x, point.y - this.nodes[0].y) * this.editor.getZoomLevel() <= 8
    ) {
      this.finish(true);
      return;
    }
    if (this.nodes.length && Math.hypot(point.x - this.nodes.at(-1)!.x, point.y - this.nodes.at(-1)!.y) < 1e-6) return;
    if (!this.shapeId) {
      if (this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) return;
      this.shapeId = createShapeId();
      this.mark = `cad-bezier-${this.shapeId}`;
      this.editor.mark(this.mark);
      this.editor.createShape({
        id: this.shapeId,
        type: 'cad-bezier',
        parentId: this.editor.getCurrentPageId(),
        x: 0,
        y: 0,
        props: {
          contours: [{ closed: false, nodes: [nodeAt(point), nodeAt({ x: point.x + 1e-5, y: point.y })] }],
          color: this.editor.getStyleForNextShape(DefaultColorStyle)
        }
      });
    }
    this.nodes.push(nodeAt(point));
    this.dragging = true;
    this.render();
    if (this.nodes.length >= 4096) this.finish(false);
  };
  override onPointerMove = () => {
    if (this.editor.getInstanceState().isReadonly) {
      this.cancel();
      return;
    }
    if (!this.dragging || !this.nodes.length) { snapCadPoint(this.editor, this.editor.inputs.currentPagePoint, this.shapeId); return; }
    clearCadSnap(this.editor);
    const last = this.nodes.at(-1)!,
      point = this.editor.inputs.currentPagePoint;
    let x = point.x - last.x,
      y = point.y - last.y;
    if (this.editor.inputs.shiftKey) {
      const angle = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) * Math.PI) / 4,
        length = Math.hypot(x, y);
      x = length * Math.cos(angle);
      y = length * Math.sin(angle);
    }
    const next = { ...last, outX: x, outY: y, inX: -x, inY: -y, mode: 'symmetric' as const };
    const nodes = [...this.nodes.slice(0, -1), next];
    if (
      validContours([
        { closed: false, nodes: nodes.length > 1 ? nodes : [...nodes, nodeAt({ x: last.x + 1e-5, y: last.y })] }
      ])
    ) {
      this.nodes = nodes;
      this.render();
    }
  };
  override onPointerUp = () => {
    this.dragging = false;
  };
  override onKeyDown: TLEventHandlers['onKeyDown'] = (info) => {
    if (info.key === 'Enter') this.finish(false);
    else if (info.key === 'Escape') this.cancel();
    else if (info.key === 'Backspace') {
      if (this.nodes.length <= 1) this.cancel();
      else {
        this.nodes.pop();
        this.render();
      }
    }
  };
  override onDoubleClick = () => {
    this.finish(false);
  };
  override onComplete = () => {
    this.finish(false);
  };
  override onCancel = () => {
    this.cancel();
  };
  override onInterrupt = () => {
    this.finish(false);
  };
  override onExit = () => {
    if (this.mark) this.finish(false, false);
  };
  private finish(closed: boolean, select = true) {
    clearCadSnap(this.editor);
    if (this.nodes.length < 2 || this.editor.getInstanceState().isReadonly) {
      this.cancel(select);
      return;
    }
    const id = this.shapeId,
      mark = this.mark;
    this.render(closed);
    this.shapeId = null;
    this.mark = null;
    this.nodes = [];
    this.dragging = false;
    if (select) this.editor.setCurrentTool('select');
    if (id) this.editor.setSelectedShapes([id]);
    if (mark) this.editor.mark(`${mark}-complete`);
  }
  private cancel(select = true) {
    clearCadSnap(this.editor);
    const mark = this.mark;
    this.shapeId = null;
    this.mark = null;
    this.nodes = [];
    this.dragging = false;
    if (mark) this.editor.bailToMark(mark);
    if (select) this.editor.setCurrentTool('select');
  }
}
