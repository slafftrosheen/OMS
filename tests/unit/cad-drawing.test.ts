import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { Box, Polygon2d, Vec, Mat, Editor, createTLStore, defaultShapeUtils, PageRecordType, getIndices } from '@tldraw/tldraw';
import { DEFAULT_CAD_SETTINGS as defaults, validateCadSettings, readCadSettings, writeCadSettings, canvasLengthToUnit, unitLengthToCanvas, cadPointToCanvas, canvasPointToCad } from '../../src/lib/components/canvas/cad-settings';
import { buildCadDxf, serializeCadDxf, CadDxfError } from '../../src/lib/components/canvas/cad-dxf';
import { createCadGeometry, getCadSelection, transformCadSelection, getCadPathPoints, updateCadPathPoints, calibrateCadSelection, setCadOriginToSelection, nudgeCadSelection, createCadDimension, convertSelectionToCadPath, getCadArc, updateCadArc } from '../../src/lib/components/canvas/cad-geometry';
import { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil } from '../../src/lib/components/canvas/shapes/CadShapes';
import { getCadSelectionPageBounds } from '../../src/lib/components/canvas/cad-bounds';
import { snapCadPoint } from '../../src/lib/components/canvas/cad-snap';
import { installCadTransforms } from '../../src/lib/components/canvas/cad-transforms';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function fixture() {
  const shapes = new Map<string, any>();
  let page: any = { id: 'page:one', meta: { retained: 'metadata' } }, selected: string[] = [];
  const state = { isReadonly: false, tool: 'select', failCreation: false, bindings: [] as any[], zoom: 1, snap: false };
  const marks: Array<{ id: string; shapes: any[]; page: any; selected: string[] }> = [];
  const descendants = (ids: string[]) => { const result = new Set(ids); for (const id of result) for (const s of shapes.values()) if (s.parentId === id) result.add(s.id); return result; };
  const transform = (value: any): any => {
    const s = typeof value === 'string' ? shapes.get(value) : value;
    const parent = shapes.get(s.parentId), upstream = parent ? transform(parent) : null;
    const local = Mat.Identity().translate(s.x, s.y).rotate(s.rotation);
    return upstream ? upstream.clone().multiply(local) : local;
  };
  const inverse = (t: any, p: any) => { const origin = t.point(), a = -t.rotation(), dx = p.x - origin.x, dy = p.y - origin.y; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; };
  const editor: any = {
    options: { maxShapesPerPage: 4000 }, inputs: { currentPagePoint: { x: 0, y: 0 }, shiftKey: false },
    user: { getIsSnapMode: () => state.snap },
    getInstanceState: () => state, getCurrentToolId: () => state.tool, setCurrentTool: (tool: string) => state.tool = tool,
    getCurrentPage: () => page, getCurrentPageId: () => page.id, updatePage: (p: any) => page = { ...page, ...p },
    getCurrentPageShapeIds: () => new Set(shapes.keys()), getCurrentPageShapesSorted: () => [...shapes.values()],
    getSelectedShapeIds: () => selected, getSelectedShapes: () => selected.map(id => shapes.get(id)).filter(Boolean), getOnlySelectedShape: () => selected.length === 1 ? shapes.get(selected[0]) : null,
    setSelectedShapes: (ids: string[]) => selected = ids, selectNone: () => selected = [], getShapeAndDescendantIds: descendants,
    getShape: (id: string) => shapes.get(id), getShapeMask: (id: string) => shapes.get(id)?.mask,
    isShapeOrAncestorLocked: (value: any): boolean => { const s = typeof value === 'string' ? shapes.get(value) : value; return !!s && (s.isLocked || editor.isShapeOrAncestorLocked(s.parentId)); },
    getCanUndo: () => marks.length > 0, getCanRedo: () => false, complete() {}, focus() {}, setCursor() {},
    getStyleForNextShape: () => 'black', getZoomLevel: () => state.zoom,
    getShapePageTransform: transform, getPointInParentSpace: (s: any, p: any) => { if (typeof s === 'string') s = shapes.get(s); return shapes.has(s.parentId) ? inverse(transform(shapes.get(s.parentId)), p) : p; },
    getPointInShapeSpace: (s: any, p: any) => inverse(transform(s), p), getBindingsInvolvingShape: () => state.bindings,
    createShape: (s: any) => { if (state.failCreation) return; const util = utils[s.type]; const shape = { x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, parentId: page.id, meta: {}, ...s, props: { ...(util?.getDefaultProps() ?? {}), ...s.props } }; shapes.set(shape.id, shape); },
    deleteShapes: (ids: string[]) => { ids.forEach(id => shapes.delete(id)); selected = selected.filter(id => shapes.has(id)); },
    updateShapes: (updates: any[]) => updates.forEach(u => editor.updateShape(u)),
    updateShape: (u: any) => { const s = shapes.get(u.id); if (s) shapes.set(u.id, { ...s, ...u, props: { ...s.props, ...u.props } }); },
    run: (fn: () => void) => fn(), mark: (id: string) => marks.push({ id, shapes: structuredClone([...shapes.values()]), page: structuredClone(page), selected: [...selected] }),
    bailToMark: (id: string) => { const index = marks.findIndex(m => m.id === id); const m = marks[index]; shapes.clear(); m.shapes.forEach(s => shapes.set(s.id, s)); page = m.page; selected = m.selected; marks.splice(index); },
    getShapeGeometry: (s: any) => { if (typeof s === 'string') s = shapes.get(s); if (utils[s.type]) return utils[s.type].getGeometry(s);
      const w = s.props.w ?? 100, h = s.props.h ?? 50; const body = new Polygon2d({ points: [new Vec(0, 0), new Vec(w, 0), new Vec(w, h), new Vec(0, h)], isFilled: false }); return { bounds: new Box(0, 0, w, h), children: [body], vertices: body.vertices }; },
    getShapeUtil: (s: any) => utils[(typeof s === 'string' ? shapes.get(s) : s).type] ?? { canResize: () => true, hideRotateHandle: () => false, isAspectRatioLocked: () => false },
    getShapePageBounds: (s: any) => { if (typeof s === 'string') s = shapes.get(s); return Box.FromPoints(editor.getShapeGeometry(s).vertices.map((p: any) => transform(s).applyToPoint(p))); },
    getSelectionPageBounds: () => selected.length ? Box.Common(selected.map(id => editor.getShapePageBounds(id))) : undefined,
    rotateShapesBy: (ids: string[], angle: number) => { for (const id of ids) { const s = shapes.get(id); editor.updateShape({ id, rotation: s.rotation + angle }); } },
    resizeShape: Editor.prototype.resizeShape,
    _scalePagePoint: (Editor.prototype as any)._scalePagePoint,
    _resizeUnalignedShape: (Editor.prototype as any)._resizeUnalignedShape,
    flipShapes: Editor.prototype.flipShapes,
    isShapeOfType: (shape: any, type: string) => shape.type === type,
    getSortedChildIdsForParent: (id: string) => [...shapes.values()].filter(s => s.parentId === id).map(s => s.id),
    nudgeShapes: (ids: string[], delta: any) => { for (const id of ids) { const s = shapes.get(id); const point = transform(s).point(); const local = editor.getPointInParentSpace(s, { x: point.x + delta.x, y: point.y + delta.y }); editor.updateShape({ id, x: local.x, y: local.y }); } },
  };
  const utils: Record<string, any> = { 'cad-path': new CadPathShapeUtil(editor), 'cad-ellipse': new CadEllipseShapeUtil(editor), 'cad-arc': new CadArcShapeUtil(editor), 'cad-dimension': new CadDimensionShapeUtil(editor) };
  installCadTransforms(editor);
  return { editor, shapes, state, marks, utils, only: () => editor.getOnlySelectedShape() };
}
function pairs(text: string) { const lines = text.trim().split(/\r?\n/); const groups = []; for (let i = 0; i < lines.length; i += 2) groups.push([Number(lines[i]), lines[i + 1]] as const); return groups; }
function dxfEntities(text: string) {
  const groups = pairs(text); let active = false; const entities: Array<Array<readonly [number, string]>> = [];
  for (const p of groups) { if (p[0] === 2 && p[1] === 'ENTITIES') { active = true; continue; } if (!active) continue; if (p[0] === 0 && p[1] === 'ENDSEC') break; if (p[0] === 0) entities.push([]); entities.at(-1)?.push(p); }
  return entities;
}
const value = (entity: ReadonlyArray<readonly [number, string]>, code: number) => Number(entity.find(p => p[0] === code)?.[1]);

describe('CAD physical coordinates and saved settings', () => {
  it('round-trips all CAD shape schemas and document units through the native serialized store', () => {
    const shapeUtils = [...defaultShapeUtils, CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil];
    const store = createTLStore({ shapeUtils });
    const page = PageRecordType.create({ id: PageRecordType.createId('cad'), name: 'CAD', index: getIndices(1)[0], meta: { omsCad: { ...defaults, scale: 10 } } });
    const f = fixture(), indices = getIndices(4);
    const records = Object.entries(f.utils).map(([type, util], i) => store.schema.types.shape.create({ id: `shape:cad${i}` as any, type, parentId: page.id, index: indices[i], props: util.getDefaultProps() }));
    store.put([page, ...records]);
    const snapshot = JSON.parse(JSON.stringify(store.getStoreSnapshot('document')));
    const restored = createTLStore({ shapeUtils }); restored.loadStoreSnapshot(snapshot);
    assert.deepEqual(restored.get(page.id), page);
    records.forEach(record => assert.deepEqual(restored.get(record.id), record));
  });
  it('preserves physical size across units and converts Y-up independently of view zoom', () => {
    for (const unit of ['mm', 'cm', 'm', 'in'] as const) for (const scale of [0.1, 1, 10, 100]) {
      const settings = { ...defaults, unit, scale, originX: 13, originY: 27 };
      near(unitLengthToCanvas(canvasLengthToUnit(378, settings), settings), 378);
      const p = canvasPointToCad(cadPointToCanvas({ x: -24, y: 75 }, settings), settings); near(p.x, -24); near(p.y, 75);
    }
    near(canvasLengthToUnit(96, defaults), 25.4); near(canvasLengthToUnit(96, { ...defaults, unit: 'in' }), 1);
  });
  it('leaves legacy drawings uncalibrated until explicitly configured, persists metadata and guards invalid/readonly writes', () => {
    const f = fixture(); assert.equal(readCadSettings(f.editor), null);
    assert.equal(writeCadSettings(f.editor, defaults), true); assert.equal(f.editor.getCurrentPage().meta.retained, 'metadata');
    assert.deepEqual(readCadSettings(f.editor), defaults); assert.equal(f.marks.length, 2);
    f.editor.bailToMark(f.marks[0].id); assert.equal(readCadSettings(f.editor), null);
    for (const patch of [{ scale: 0 }, { scale: Infinity }, { unit: 'px' }, { precision: 1.5 }, { nudge: 0 }, { originX: NaN }]) assert.equal(validateCadSettings({ ...defaults, ...patch }), null);
    f.state.isReadonly = true; assert.equal(writeCadSettings(f.editor, defaults), false);
  });
  it('calibrates a known span and changes origin without moving the drawing', () => {
    const f = fixture(); createCadGeometry(f.editor, { kind: 'rectangle', x: 10, y: 20, width: 100, height: 50 }, defaults);
    const before = structuredClone(f.only());
    assert.equal(calibrateCadSelection(f.editor, 200, 'width', defaults), true); near(readCadSettings(f.editor)!.scale, 2);
    assert.deepEqual(f.only(), before);
    assert.equal(setCadOriginToSelection(f.editor, defaults), true);
    const position = getCadSelection(f.editor, readCadSettings(f.editor)!, 'bottom-left')!; near(position.x, 0); near(position.y, 0);
    f.editor.updateShape({ id: f.only().id, rotation: Math.PI / 4 });
    assert.equal(calibrateCadSelection(f.editor, 100, 'width', defaults), true); near(readCadSettings(f.editor)!.scale, 1);
  });
});

describe('Precise CAD geometry and editing', () => {
  it('measures subpixel ellipses and rotated arcs analytically, including native selection vertices', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:tiny', type: 'cad-ellipse', props: { w: 0.2, h: 0.4 } });
    f.editor.setSelectedShapes(['shape:tiny']);
    near(f.editor.getSelectionPageBounds().w, 0.2); near(getCadSelectionPageBounds(f.editor)!.h, 0.4);
    assert.equal(createCadDimension(f.editor, defaults, 'horizontal'), true); near(f.only().props.endX, 0.2);
    f.editor.createShape({ id: 'shape:arc', type: 'cad-arc', rotation: 37 * Math.PI / 180, props: { radius: 100, startAngle: 0, endAngle: 180 } });
    f.editor.setSelectedShapes(['shape:arc']);
    assert.ok(f.editor.getSelectionPageBounds().minY <= -100); near(getCadSelectionPageBounds(f.editor)!.minY, -100);
    assert.equal(setCadOriginToSelection(f.editor, defaults), true);
    near(readCadSettings(f.editor)!.originY, 100 * Math.sin(37 * Math.PI / 180));
    assert.equal(createCadDimension(f.editor, defaults, 'vertical'), true);
    near(-f.only().props.endY, 100 + 100 * Math.sin(37 * Math.PI / 180));
  });
  it('uses native mirrored/resized geometry for arcs and dimensions, including rotated shapes', () => {
    for (const type of ['cad-path', 'cad-arc', 'cad-dimension']) for (const rotation of [0, 37 * Math.PI / 180]) for (const parentRotation of [0, Math.PI / 3]) {
      const f = fixture();
      f.editor.createShape({ id: 'shape:parent', type: 'group', x: 50, y: 20, rotation: parentRotation });
      f.editor.createShape({ id: 'shape:subject', type, parentId: 'shape:parent', x: 100, y: 80, rotation, props: type === 'cad-arc' ? { radius: 100, startAngle: 15, endAngle: 140 } : type === 'cad-path' ? { points: [{ x: 0, y: 0 }, { x: 80, y: 30 }, { x: 50, y: -20 }], closed: true } : { endX: 80, endY: -30, offset: 24 } });
      f.editor.setSelectedShapes(['shape:subject']);
      const before = structuredClone(f.only()), oldBounds = f.editor.getShapePageBounds(before);
      const endpoints = (shape: any) => {
        const points = type === 'cad-arc' ? [shape.props.startAngle, shape.props.endAngle].map(a => ({ x: shape.props.radius * Math.cos(a * Math.PI / 180), y: -shape.props.radius * Math.sin(a * Math.PI / 180) })) : type === 'cad-path' ? shape.props.points : [{ x: 0, y: 0 }, { x: shape.props.endX, y: shape.props.endY }];
        return points.map(p => f.editor.getShapePageTransform(shape).applyToPoint(p));
      };
      const originalPoints = endpoints(before);
      f.editor.flipShapes(['shape:subject'], 'horizontal');
      const mirrored = endpoints(f.only()); if (type === 'cad-arc') mirrored.reverse();
      originalPoints.forEach((p, i) => { near(mirrored[i].x, 2 * oldBounds.center.x - p.x); near(mirrored[i].y, p.y); });
      const beforeResize = endpoints(f.only());
      f.editor.resizeShape(f.only(), { x: 2, y: 2 }, { scaleOrigin: { x: 0, y: 0 }, scaleAxisRotation: 0 });
      const afterResize = endpoints(f.only());
      beforeResize.forEach((p, i) => { near(afterResize[i].x, p.x * 2); near(afterResize[i].y, p.y * 2); });
      if (type === 'cad-arc') near(f.only().props.radius, 200);
      else if (type === 'cad-dimension') near(Math.hypot(f.only().props.endX, f.only().props.endY), 2 * Math.hypot(80, 30));
      else near(Math.hypot(f.only().props.points[1].x, f.only().props.points[1].y), 2 * Math.hypot(80, 30));
    }
  });
  it('creates exact geometry below native one-pixel limits and sizes it without losing the anchor', () => {
    const f = fixture(), settings = { ...defaults, scale: 10 };
    assert.equal(createCadGeometry(f.editor, { kind: 'rectangle', x: 10, y: 20, width: 0.1, height: 0.2 }, settings), true);
    let size = getCadSelection(f.editor, settings, 'bottom-left')!; near(size.w, 0.1); near(size.h, 0.2); near(size.x, 10); near(size.y, 20);
    assert.equal(transformCadSelection(f.editor, 'w', 0.2, settings, 'bottom-left', true), true);
    size = getCadSelection(f.editor, settings, 'bottom-left')!; near(size.w, 0.2); near(size.h, 0.4); near(size.x, 10); near(size.y, 20);
    assert.equal(transformCadSelection(f.editor, 'rotation', 37, settings, 'bottom-left', false), true);
    size = getCadSelection(f.editor, settings, 'bottom-left')!; near(size.rotation, 37); near(size.x, 10); near(size.y, 20);
  });
  it('edits world coordinates through rotated parents and preserves the selected reference point', () => {
    const f = fixture(); f.editor.createShape({ id: 'shape:group', type: 'group', x: 200, y: -150, rotation: Math.PI / 3, props: {} });
    createCadGeometry(f.editor, { kind: 'rectangle', x: 0, y: 0, width: 100, height: 50 }, defaults);
    f.editor.updateShape({ id: f.only().id, parentId: 'shape:group', rotation: Math.PI / 5 });
    assert.equal(transformCadSelection(f.editor, 'x', 300, defaults, 'center', false), true);
    assert.equal(transformCadSelection(f.editor, 'y', -125, defaults, 'center', false), true);
    const p = getCadSelection(f.editor, defaults, 'center')!; near(p.x, 300); near(p.y, -125);
    assert.equal(nudgeCadSelection(f.editor, 1, 2, defaults), true);
    const nudged = getCadSelection(f.editor, defaults, 'center')!; near(nudged.x, 301); near(nudged.y, -123);
  });
  it('rejects invalid sizes, too many/degenerate nodes, protected forms, locks and read-only edits', () => {
    const f = fixture(); assert.equal(createCadGeometry(f.editor, { kind: 'arc', x: 0, y: 0, radius: 50, startAngle: 0, endAngle: 360 }, defaults), false);
    assert.equal(createCadGeometry(f.editor, { kind: 'polyline', points: Array(257).fill({ x: 0, y: 0 }), closed: false }, defaults), false);
    createCadGeometry(f.editor, { kind: 'line', x: 0, y: 0, length: 100, angle: 30 }, defaults);
    const id = f.only().id; f.editor.updateShape({ id, isLocked: true });
    assert.equal(updateCadPathPoints(f.editor, [{ x: 0, y: 0 }, { x: 10, y: 10 }], false, defaults), false);
    assert.equal(transformCadSelection(f.editor, 'x', 10, defaults, 'center', false), false);
    f.editor.updateShape({ id, isLocked: false, type: 'order-details' }); assert.equal(nudgeCadSelection(f.editor, 1, 0, defaults), false);
    f.state.isReadonly = true; assert.equal(createCadGeometry(f.editor, { kind: 'ellipse', x: 0, y: 0, width: 1, height: 1 }, defaults), false);
  });
  it('edits contour nodes without smoothing, and converts a native line atomically without overlapping originals', () => {
    const f = fixture(); f.editor.createShape({ id: 'shape:line', type: 'line', x: 12, y: 8, props: { color: 'black', spline: 'line', points: { a: { x: 0, y: 0, index: 'a1' }, b: { x: 100, y: 50, index: 'a2' } } } }); f.editor.setSelectedShapes(['shape:line']);
    f.state.bindings = [{}]; assert.equal(convertSelectionToCadPath(f.editor), false); f.state.bindings = [];
    assert.equal(convertSelectionToCadPath(f.editor), true); assert.equal(f.shapes.size, 1); assert.equal(f.shapes.has('shape:line'), false);
    const points = [{ x: 5, y: 10 }, { x: 105, y: 10 }, { x: 105, y: 60 }];
    assert.equal(updateCadPathPoints(f.editor, points, true, defaults), true);
    const result = getCadPathPoints(f.editor, defaults)!; assert.equal(result.closed, true); result.points.forEach((p, i) => { near(p.x, points[i].x); near(p.y, points[i].y); });
  });
  it('edits arc centre/radius/angles independently of shape rotation and keeps extrema precise', () => {
    const f = fixture(); createCadGeometry(f.editor, { kind: 'arc', x: 10, y: 20, radius: 25, startAngle: 10, endAngle: 190 }, defaults);
    const b = f.editor.getShapeGeometry(f.only()).bounds; near(b.minX, -unitLengthToCanvas(25, defaults));
    f.editor.updateShape({ id: f.only().id, rotation: 0.4 });
    const values = { x: 100, y: 75, radius: 40, startAngle: -10, endAngle: 90 };
    assert.equal(updateCadArc(f.editor, values, defaults), true);
    const actual = getCadArc(f.editor, defaults)!; Object.keys(values).forEach(key => near(actual[key], values[key]));
  });
  it('creates a measured endpoint snapshot that is separate from cut geometry and honours page capacity', () => {
    const f = fixture(); createCadGeometry(f.editor, { kind: 'line', x: 0, y: 0, length: 125, angle: 37 }, defaults);
    assert.equal(createCadDimension(f.editor, defaults, 'aligned'), true); const dimension = f.only();
    near(canvasLengthToUnit(Math.hypot(dimension.props.endX, dimension.props.endY), defaults), 125);
    const result = buildCadDxf(f.editor, 'selected', defaults); assert.equal(result.entities, 0); assert.equal(result.omitted[0].reason, 'text');
    f.editor.options.maxShapesPerPage = f.shapes.size; assert.equal(createCadGeometry(f.editor, { kind: 'line', x: 0, y: 0, length: 10, angle: 0 }, defaults), false);
  });
  it('rolls back a refused native creation instead of reporting success', () => {
    const f = fixture(); f.state.failCreation = true;
    assert.equal(createCadGeometry(f.editor, { kind: 'line', x: 0, y: 0, length: 10, angle: 0 }, defaults), false); assert.equal(f.shapes.size, 0); assert.equal(f.marks.length, 0);
  });
});

describe('CAD polyline interaction', () => {
  it('snaps to exact transformed endpoints and centres with zoom tolerance and Ctrl override', () => {
    const f = fixture(); f.state.snap = true;
    f.editor.createShape({ id: 'shape:target', type: 'cad-path', x: 100, y: 50, rotation: Math.PI / 2, props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } });
    let p = snapCadPoint(f.editor, { x: 103, y: 148 }, null); near(p.x, 100); near(p.y, 150);
    f.state.zoom = 4; p = snapCadPoint(f.editor, { x: 103, y: 148 }, null); near(p.x, 103);
    f.state.zoom = 1; f.editor.inputs.ctrlKey = true;
    p = snapCadPoint(f.editor, { x: 103, y: 148 }, null); near(p.x, 103);
    f.state.snap = false; p = snapCadPoint(f.editor, { x: 103, y: 148 }, null); near(p.x, 100);
    p = snapCadPoint(f.editor, { x: 103, y: 148 }, 'shape:target' as any); near(p.x, 103);
  });
  it('closes a click contour without retaining the rubber-band preview, and cancels in one rollback', () => {
    const f = fixture(); const tool = new CadPolylineTool(f.editor); tool.onEnter();
    const click = (x: number, y: number) => { f.editor.inputs.currentPagePoint = { x, y }; tool.onPointerDown({ button: 0 } as any); };
    click(0, 0); click(100, 0); click(100, 50); f.editor.inputs.currentPagePoint = { x: 200, y: 90 }; tool.onPointerMove(); click(0, 0);
    assert.equal(f.only().props.closed, true); assert.equal(f.only().props.points.length, 3); assert.equal(f.state.tool, 'select');
    const count = f.shapes.size; tool.onEnter(); click(200, 200); click(250, 200); tool.onCancel(); assert.equal(f.shapes.size, count);
  });
  it('constrains drafting to 45-degree increments and finishes only committed points', () => {
    const f = fixture(); const tool = new CadPolylineTool(f.editor); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 0, y: 0 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.shiftKey = true; f.editor.inputs.currentPagePoint = { x: 100, y: 91 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.currentPagePoint = { x: 200, y: 190 }; tool.onPointerMove(); tool.onKeyDown({ key: 'Enter' } as any);
    assert.equal(f.only().props.points.length, 2); near(f.only().props.points[1].x, f.only().props.points[1].y);
  });
});

describe('Production DXF geometry', () => {
  it('preserves native fractional-index order across upper and lower case keys', () => {
    const f = fixture(), indices = ['a8', 'a9', 'aA', 'aB', 'aZ', 'aa', 'ab'];
    f.editor.createShape({ id: 'shape:line', type: 'line', props: { spline: 'line', points: Object.fromEntries(indices.map((index, x) => [index, { index, x: x * 100, y: x % 2 * 10 }])) } });
    f.editor.setSelectedShapes(['shape:line']);
    const entity = dxfEntities(buildCadDxf(f.editor, 'selected', defaults).text)[0];
    entity.filter(p => p[0] === 10).forEach((p, i) => near(Number(p[1]), canvasLengthToUnit(i * 100, defaults)));
  });
  it('exports actual full-size millimetres at drawing scale 1:10, including inch display, with no view padding', () => {
    const f = fixture(), settings = { ...defaults, scale: 10, unit: 'in' as const };
    createCadGeometry(f.editor, { kind: 'rectangle', x: 2, y: 3, width: 40, height: 20 }, settings);
    f.state.zoom = 0.25;
    const result = buildCadDxf(f.editor, 'selected', settings); near(result.widthMm, 1016); near(result.heightMm, 508);
    assert.equal(result.closedContours, 1); assert.equal(result.omitted.length, 0);
    const poly = dxfEntities(result.text)[0]; assert.equal(poly[0][1], 'LWPOLYLINE'); near(value(poly, 10), 50.8); assert.equal(value(poly, 70), 1);
    assert.match(result.text, /\$INSUNITS\r\n70\r\n4/); assert.doesNotMatch(result.text, /NaN|Infinity/);
  });
  it('keeps circles, rotated ellipses and wrapped arcs analytic and separates open/closed layers', () => {
    const result = serializeCadDxf([{ type: 'circle', center: { x: 100, y: 200 }, radius: 25 }, { type: 'ellipse', center: { x: 0, y: 0 }, major: { x: 100, y: 100 }, ratio: 0.123456789123 },
      { type: 'arc', center: { x: 0, y: 0 }, radius: 50, start: 350, end: 80 }, { type: 'polyline', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }]);
    const entities = dxfEntities(result.text); assert.deepEqual(entities.map(e => e[0][1]), ['CIRCLE', 'ELLIPSE', 'ARC', 'LINE']);
    near(value(entities[0], 40), 25); assert.equal(value(entities[1], 42), Math.PI * 2); assert.equal(value(entities[1], 40), 0.123456789123);
    assert.equal(value(entities[2], 50), 350); assert.equal(value(entities[2], 51), 80);
    assert.equal(entities[0].find(p => p[0] === 8)?.[1], 'OMS_CLOSED'); assert.equal(entities[3].find(p => p[0] === 8)?.[1], 'OMS_OPEN');
  });
  it('reports unsupported content and incomplete frame geometry rather than silently exporting it', () => {
    const f = fixture(); createCadGeometry(f.editor, { kind: 'rectangle', x: 0, y: 0, width: 100, height: 50 }, defaults);
    const a = f.only(); f.editor.createShape({ id: 'shape:form', type: 'order-details', props: {} });
    let result = buildCadDxf(f.editor, 'all', defaults); assert.equal(result.entities, 1); assert.deepEqual(result.omitted.map(o => o.reason), ['unsupported']);
    f.editor.updateShape({ id: a.id, mask: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] });
    result = buildCadDxf(f.editor, 'all', defaults); assert.equal(result.entities, 0); assert.equal(result.text, ''); assert.equal(result.omitted[0].reason, 'clipped');
    f.editor.setSelectedShapes([]); assert.throws(() => buildCadDxf(f.editor, 'selected', defaults), (e: any) => e.code === 'empty');
  });
  it('rejects degenerate contours, non-finite geometry and allocation-exceeding requests', () => {
    for (const entity of [{ type: 'circle', center: { x: 0, y: 0 }, radius: Infinity }, { type: 'polyline', points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], closed: false },
      { type: 'ellipse', center: { x: 0, y: 0 }, major: { x: 10, y: 0 }, ratio: 2 }]) assert.throws(() => serializeCadDxf([entity as any]), CadDxfError);
    assert.throws(() => serializeCadDxf(Array(4001).fill({ type: 'circle', center: { x: 0, y: 0 }, radius: 1 })), (e: any) => e.code === 'limit');
  });
});
