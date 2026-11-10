import { Box, Polygon2d, Vec, Mat, Editor } from '@tldraw/tldraw';
import {
  CadPathShapeUtil,
  CadEllipseShapeUtil,
  CadArcShapeUtil,
  CadDimensionShapeUtil
} from '../../src/lib/components/canvas/shapes/CadShapes';
import { CadBezierShapeUtil } from '../../src/lib/components/canvas/shapes/CadBezierShape';
import { installCadTransforms } from '../../src/lib/components/canvas/cad-transforms';

export function fixture() {
  const shapes = new Map<string, any>();
  let page: any = { id: 'page:one', meta: { retained: 'metadata' } },
    selected: string[] = [];
  const state = { isReadonly: false, tool: 'select', failCreation: false, bindings: [] as any[], zoom: 1, snap: false };
  const marks: Array<{ id: string; shapes: any[]; page: any; selected: string[] }> = [];
  const descendants = (ids: string[]) => {
    const result = new Set(ids);
    for (const id of result) for (const s of shapes.values()) if (s.parentId === id) result.add(s.id);
    return result;
  };
  const transform = (value: any): any => {
    const s = typeof value === 'string' ? shapes.get(value) : value;
    const parent = shapes.get(s.parentId),
      upstream = parent ? transform(parent) : null;
    const local = Mat.Identity().translate(s.x, s.y).rotate(s.rotation);
    return upstream ? upstream.clone().multiply(local) : local;
  };
  const inverse = (t: any, p: any) => {
    const origin = t.point(),
      a = -t.rotation(),
      dx = p.x - origin.x,
      dy = p.y - origin.y;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  };
  const editor: any = {
    options: { maxShapesPerPage: 4000 },
    inputs: { currentPagePoint: { x: 0, y: 0 }, shiftKey: false },
    user: { getIsSnapMode: () => state.snap },
    getInstanceState: () => state,
    getCurrentToolId: () => state.tool,
    setCurrentTool: (tool: string) => (state.tool = tool),
    getCurrentPage: () => page,
    getCurrentPageId: () => page.id,
    updatePage: (p: any) => (page = { ...page, ...p }),
    getCurrentPageShapeIds: () => new Set(shapes.keys()),
    getCurrentPageShapesSorted: () => [...shapes.values()],
    getSelectedShapeIds: () => selected,
    getSelectedShapes: () => selected.map((id) => shapes.get(id)).filter(Boolean),
    getOnlySelectedShape: () => (selected.length === 1 ? shapes.get(selected[0]) : null),
    setSelectedShapes: (ids: string[]) => (selected = ids),
    selectNone: () => (selected = []),
    getShapeAndDescendantIds: descendants,
    getShape: (id: string) => shapes.get(id),
    getShapeMask: (id: string) => shapes.get(id)?.mask,
    isShapeOrAncestorLocked: (value: any): boolean => {
      const s = typeof value === 'string' ? shapes.get(value) : value;
      return !!s && (s.isLocked || editor.isShapeOrAncestorLocked(s.parentId));
    },
    getCanUndo: () => marks.length > 0,
    getCanRedo: () => false,
    complete() {},
    focus() {},
    setCursor() {},
    getStyleForNextShape: () => 'black',
    getZoomLevel: () => state.zoom,
    getShapePageTransform: transform,
    getPointInParentSpace: (s: any, p: any) => {
      if (typeof s === 'string') s = shapes.get(s);
      return shapes.has(s.parentId) ? inverse(transform(shapes.get(s.parentId)), p) : p;
    },
    getPointInShapeSpace: (s: any, p: any) => inverse(transform(s), p),
    getBindingsInvolvingShape: () => state.bindings,
    createShape: (s: any) => {
      if (state.failCreation) return;
      const util = utils[s.type];
      const shape = {
        x: 0,
        y: 0,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        parentId: page.id,
        meta: {},
        ...s,
        props: { ...(util?.getDefaultProps() ?? {}), ...s.props }
      };
      shapes.set(shape.id, shape);
    },
    deleteShapes: (ids: string[]) => {
      ids.forEach((id) => shapes.delete(id));
      selected = selected.filter((id) => shapes.has(id));
    },
    updateShapes: (updates: any[]) => updates.forEach((u) => editor.updateShape(u)),
    updateShape: (u: any) => {
      const s = shapes.get(u.id);
      if (s) shapes.set(u.id, { ...s, ...u, props: { ...s.props, ...u.props } });
    },
    run: (fn: () => void) => fn(),
    mark: (id: string) =>
      marks.push({
        id,
        shapes: structuredClone([...shapes.values()]),
        page: structuredClone(page),
        selected: [...selected]
      }),
    bailToMark: (id: string) => {
      const index = marks.findIndex((m) => m.id === id);
      const m = marks[index];
      shapes.clear();
      m.shapes.forEach((s) => shapes.set(s.id, s));
      page = m.page;
      selected = m.selected;
      marks.splice(index);
    },
    getShapeGeometry: (s: any) => {
      if (typeof s === 'string') s = shapes.get(s);
      if (utils[s.type]) return utils[s.type].getGeometry(s);
      const w = s.props.w ?? 100,
        h = s.props.h ?? 50;
      const body = new Polygon2d({
        points: [new Vec(0, 0), new Vec(w, 0), new Vec(w, h), new Vec(0, h)],
        isFilled: false
      });
      return { bounds: new Box(0, 0, w, h), children: [body], vertices: body.vertices };
    },
    getShapeUtil: (s: any) =>
      utils[(typeof s === 'string' ? shapes.get(s) : s).type] ?? {
        canResize: () => true,
        hideRotateHandle: () => false,
        isAspectRatioLocked: () => false
      },
    getShapePageBounds: (s: any) => {
      if (typeof s === 'string') s = shapes.get(s);
      return Box.FromPoints(editor.getShapeGeometry(s).vertices.map((p: any) => transform(s).applyToPoint(p)));
    },
    getSelectionPageBounds: () =>
      selected.length ? Box.Common(selected.map((id) => editor.getShapePageBounds(id))) : undefined,
    rotateShapesBy: (ids: string[], angle: number) => {
      for (const id of ids) {
        const s = shapes.get(id);
        editor.updateShape({ id, rotation: s.rotation + angle });
      }
    },
    resizeShape: Editor.prototype.resizeShape,
    _scalePagePoint: (Editor.prototype as any)._scalePagePoint,
    _resizeUnalignedShape: (Editor.prototype as any)._resizeUnalignedShape,
    flipShapes: Editor.prototype.flipShapes,
    isShapeOfType: (shape: any, type: string) => shape.type === type,
    getSortedChildIdsForParent: (id: string) => [...shapes.values()].filter((s) => s.parentId === id).map((s) => s.id),
    nudgeShapes: (ids: string[], delta: any) => {
      for (const id of ids) {
        const s = shapes.get(id);
        const point = transform(s).point();
        const local = editor.getPointInParentSpace(s, { x: point.x + delta.x, y: point.y + delta.y });
        editor.updateShape({ id, x: local.x, y: local.y });
      }
    }
  };
  const utils: Record<string, any> = {
    'cad-bezier': new CadBezierShapeUtil(editor),
    'cad-path': new CadPathShapeUtil(editor),
    'cad-ellipse': new CadEllipseShapeUtil(editor),
    'cad-arc': new CadArcShapeUtil(editor),
    'cad-dimension': new CadDimensionShapeUtil(editor)
  };
  installCadTransforms(editor);
  return { editor, shapes, state, marks, utils, only: () => editor.getOnlySelectedShape() };
}
