import { createShapeId, type Editor, type TLShape } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { captureToolkitControls } from './toolkit-controls';
import { getCadSelectionPageBounds } from './cad-bounds';
import { CAD_MAX_COORDINATE, cadPointToCanvas, canvasPointToCad, canvasLengthToUnit, unitLengthToCanvas,
  validateCadSettings, validCadPoint, validCadPoints, writeCadSettings, type CadPoint, type CadSettings } from './cad-settings';

export type CadAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
const ANCHORS: Record<CadAnchor, [number, number]> = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0], left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1]
};
const FORMS = new Set(['order-details', 'order-address', 'profile-7st']);
function permitted(editor: Editor): boolean {
  return captureToolkitControls(editor).canEditSelection &&
    [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])].every(id => !FORMS.has(editor.getShape(id)?.type ?? ''));
}
function anchorPoint(editor: Editor, shape: TLShape, anchor: CadAnchor): CadPoint {
  const b = editor.getShapeGeometry(shape).bounds;
  const [x, y] = ANCHORS[anchor];
  return editor.getShapePageTransform(shape).applyToPoint({ x: b.x + b.w * x, y: b.y + b.h * y });
}
export function getCadSelection(editor: Editor, settings: CadSettings, anchor: CadAnchor) {
  const shape = editor.getOnlySelectedShape();
  if (!shape || !ANCHORS[anchor] || !validateCadSettings(settings)) return null;
  const b = editor.getShapeGeometry(shape).bounds;
  const point = canvasPointToCad(anchorPoint(editor, shape, anchor), settings);
  return { ...point, w: canvasLengthToUnit(b.w, settings), h: canvasLengthToUnit(b.h, settings),
    rotation: ((-editor.getShapePageTransform(shape).rotation() * 180 / Math.PI) % 360 + 360) % 360 };
}
export function transformCadSelection(editor: Editor, field: 'x' | 'y' | 'w' | 'h' | 'rotation', value: number,
  settings: CadSettings, anchor: CadAnchor, proportional: boolean): boolean {
  if (!validateCadSettings(settings) || !Number.isFinite(value) || Math.abs(value) > CAD_MAX_COORDINATE || !ANCHORS[anchor] || !permitted(editor)) return false;
  editor.complete(); editor.setCurrentTool('select');
  const shape = editor.getOnlySelectedShape();
  if (!shape || !permitted(editor)) return false;
  const util = editor.getShapeUtil(shape);
  if ((field === 'w' || field === 'h') && (value <= 0 || shape.type === 'group' || !util.canResize(shape))) return false;
  if (field === 'rotation' && util.hideRotateHandle(shape)) return false;
  const origin = anchorPoint(editor, shape, anchor);
  return drawingTransaction(editor, () => {
    if (field === 'x' || field === 'y') {
      const current = canvasPointToCad(origin, settings);
      const destination = cadPointToCanvas({ ...current, [field]: value }, settings);
      const old = editor.getShapePageTransform(shape).point();
      const next = { x: old.x + destination.x - origin.x, y: old.y + destination.y - origin.y };
      if (!validCadPoint(next)) throw new Error('Drawing bounds exceeded');
      const local = editor.getPointInParentSpace(shape, next);
      editor.updateShapes([{ id: shape.id, type: shape.type, x: local.x, y: local.y }]);
    } else if (field === 'rotation') {
      editor.rotateShapesBy([shape.id], -value * Math.PI / 180 - editor.getShapePageTransform(shape).rotation());
    } else {
      const bounds = editor.getShapeGeometry(shape).bounds;
      const initial = field === 'w' ? bounds.w : bounds.h;
      const wanted = unitLengthToCanvas(value, settings);
      if (initial <= 0 || wanted > CAD_MAX_COORDINATE) throw new Error('Invalid dimensions');
      const ratio = wanted / initial;
      const uniform = proportional || util.isAspectRatioLocked(shape);
      editor.resizeShape(shape, { x: uniform || field === 'w' ? ratio : 1, y: uniform || field === 'h' ? ratio : 1 }, {
        scaleOrigin: origin, scaleAxisRotation: editor.getShapePageTransform(shape).rotation(), mode: 'resize_bounds', isAspectRatioLocked: uniform
      });
      const actual = editor.getShapeGeometry(editor.getShape(shape.id)!).bounds[field];
      if (Math.abs(actual - wanted) > Math.max(1e-7, wanted * 1e-9)) throw new Error('Object cannot represent the requested size');
    }
    // Preserve the selected reference point for both rotation and resizing.
    if (field !== 'x' && field !== 'y') {
      const updated = editor.getShape(shape.id)!;
      const after = anchorPoint(editor, updated, anchor);
      const old = editor.getShapePageTransform(updated).point();
      const point = { x: old.x + origin.x - after.x, y: old.y + origin.y - after.y };
      if (!validCadPoint(point)) throw new Error('Drawing bounds exceeded');
      const local = editor.getPointInParentSpace(updated, point);
      editor.updateShapes([{ id: updated.id, type: updated.type, x: local.x, y: local.y }]);
    }
  });
}

export type CadGeometryInput =
  { kind: 'rectangle' | 'ellipse'; x: number; y: number; width: number; height: number; rotation?: number } |
  { kind: 'line'; x: number; y: number; length: number; angle: number } |
  { kind: 'arc'; x: number; y: number; radius: number; startAngle: number; endAngle: number } |
  { kind: 'polyline'; points: CadPoint[]; closed: boolean };

export function createCadGeometry(editor: Editor, input: CadGeometryInput, settings: CadSettings): boolean {
  if (!validateCadSettings(settings) || editor.getInstanceState().isReadonly ||
      editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) return false;
  const id = createShapeId();
  let shape: any;
  if (input.kind === 'polyline' || input.kind === 'line') {
    let points: CadPoint[];
    const closed = input.kind === 'polyline' && input.closed;
    if (input.kind === 'line') {
      if (!Number.isFinite(input.angle) || !Number.isFinite(input.length) || input.length <= 0) return false;
      const theta = input.angle * Math.PI / 180;
      points = [{ x: input.x, y: input.y }, { x: input.x + input.length * Math.cos(theta), y: input.y + input.length * Math.sin(theta) }];
    } else points = input.points;
    if (!validCadPoints(points, closed)) return false;
    const canvas = points.map(p => cadPointToCanvas(p, settings));
    if (!validCadPoints(canvas, closed)) return false;
    const first = canvas[0];
    shape = { type: 'cad-path', x: first.x, y: first.y, props: { points: canvas.map(p => ({ x: p.x - first.x, y: p.y - first.y })), closed } };
  } else {
    if (!validCadPoint(input)) return false;
    const point = cadPointToCanvas(input, settings);
    if (!validCadPoint(point)) return false;
    if (input.kind === 'arc') {
      const radius = unitLengthToCanvas(input.radius, settings);
      if (!Number.isFinite(radius) || radius <= 0 || radius > CAD_MAX_COORDINATE ||
        ![input.startAngle, input.endAngle].every(Number.isFinite) || input.endAngle - input.startAngle <= 0 || input.endAngle - input.startAngle >= 360) return false;
      shape = { type: 'cad-arc', ...point, props: { radius, startAngle: input.startAngle, endAngle: input.endAngle } };
    } else {
      const width = unitLengthToCanvas(input.width, settings), height = unitLengthToCanvas(input.height, settings);
      if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= CAD_MAX_COORDINATE) || !Number.isFinite(input.rotation ?? 0)) return false;
      shape = input.kind === 'ellipse'
        ? { type: 'cad-ellipse', x: point.x, y: point.y - height, props: { w: width, h: height } }
        : { type: 'cad-path', x: point.x, y: point.y - height, props: { closed: true,
          points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] } };
    }
  }
  return drawingTransaction(editor, () => {
    editor.complete(); editor.setCurrentTool('select');
    editor.createShape({ ...shape, id, parentId: editor.getCurrentPageId() });
    if (!editor.getShape(id)) throw new Error('Shape was not created');
    editor.setSelectedShapes([id]);
    if ((input.kind === 'rectangle' || input.kind === 'ellipse') && input.rotation) editor.rotateShapesBy([id], -input.rotation * Math.PI / 180);
  });
}
export function getCadPathPoints(editor: Editor, settings: CadSettings): { points: CadPoint[]; closed: boolean } | null {
  const shape = editor.getOnlySelectedShape();
  if (shape?.type !== 'cad-path') return null;
  const props = shape.props as { points: CadPoint[]; closed: boolean };
  return { points: props.points.map(p => canvasPointToCad(editor.getShapePageTransform(shape).applyToPoint(p), settings)), closed: props.closed };
}
export function updateCadPathPoints(editor: Editor, points: CadPoint[], closed: boolean, settings: CadSettings): boolean {
  const shape = editor.getOnlySelectedShape();
  if (shape?.type !== 'cad-path' || !permitted(editor) || !validateCadSettings(settings) || !validCadPoints(points, closed)) return false;
  const local = points.map(p => editor.getPointInShapeSpace(shape, cadPointToCanvas(p, settings)));
  if (!validCadPoints(local, closed)) return false;
  return drawingTransaction(editor, () => { editor.updateShapes([{ id: shape.id, type: shape.type, props: { points: local, closed } }]); });
}
export function getCadArc(editor: Editor, settings: CadSettings): { x: number; y: number; radius: number; startAngle: number; endAngle: number } | null {
  const shape = editor.getOnlySelectedShape();
  if (shape?.type !== 'cad-arc') return null;
  const props = shape.props as { radius: number; startAngle: number; endAngle: number };
  const point = canvasPointToCad(editor.getShapePageTransform(shape).point(), settings);
  const rotation = -editor.getShapePageTransform(shape).rotation() * 180 / Math.PI;
  return { ...point, radius: canvasLengthToUnit(props.radius, settings), startAngle: props.startAngle + rotation, endAngle: props.endAngle + rotation };
}
export function updateCadArc(editor: Editor, value: { x: number; y: number; radius: number; startAngle: number; endAngle: number }, settings: CadSettings): boolean {
  const shape = editor.getOnlySelectedShape();
  if (shape?.type !== 'cad-arc' || !validateCadSettings(settings) || !permitted(editor) || !validCadPoint(value)) return false;
  const radius = unitLengthToCanvas(value.radius, settings), sweep = value.endAngle - value.startAngle;
  if (!Number.isFinite(radius) || radius <= 0 || radius > CAD_MAX_COORDINATE || ![value.startAngle, value.endAngle].every(Number.isFinite) || sweep <= 0 || sweep >= 360) return false;
  const world = cadPointToCanvas(value, settings);
  if (!validCadPoint(world)) return false;
  const point = editor.getPointInParentSpace(shape, world);
  const rotation = editor.getShapePageTransform(shape).rotation() * 180 / Math.PI;
  return drawingTransaction(editor, () => { editor.updateShapes([{ id: shape.id, type: shape.type, x: point.x, y: point.y,
    props: { radius, startAngle: value.startAngle + rotation, endAngle: value.endAngle + rotation } }]); });
}
export function convertSelectionToCadPath(editor: Editor): boolean {
  const shape = editor.getOnlySelectedShape();
  if (!shape || shape.type !== 'line' || !permitted(editor)) return false;
  const props = shape.props as { spline: string; color: string; points: Record<string, CadPoint & { index: string }> };
  if (props.spline !== 'line') return false;
  const points = Object.values(props.points).sort((a, b) => a.index < b.index ? -1 : a.index > b.index ? 1 : 0).map(({ x, y }) => ({ x, y }));
  if (!validCadPoints(points, false) || editor.getBindingsInvolvingShape(shape.id).length || editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) return false;
  // Refuse bound shapes rather than silently breaking connectors. Replace in one undo step so DXF never contains duplicate overlapping paths.
  return drawingTransaction(editor, () => {
    const id = createShapeId();
    editor.createShape({ id, type: 'cad-path', parentId: shape.parentId, x: shape.x, y: shape.y, rotation: shape.rotation,
      props: { points, closed: false, color: props.color }, meta: { ...shape.meta } });
    if (!editor.getShape(id)) throw new Error('Contour was not created');
    editor.deleteShapes([shape.id]);
    editor.setSelectedShapes([id]);
  });
}
export function setCadOriginToSelection(editor: Editor, settings: CadSettings): boolean {
  const bounds = getCadSelectionPageBounds(editor);
  return !!bounds && writeCadSettings(editor, { ...settings, originX: bounds.minX, originY: bounds.maxY });
}
export function calibrateCadSelection(editor: Editor, knownLength: number, axis: 'width' | 'height', settings: CadSettings): boolean {
  const shape = editor.getOnlySelectedShape();
  const bounds = shape && editor.getShapeGeometry(shape).bounds;
  const span = bounds && (axis === 'width' ? bounds.w : bounds.h);
  if (!span || span <= 0 || !Number.isFinite(knownLength) || knownLength <= 0) return false;
  return writeCadSettings(editor, { ...settings, scale: settings.scale * knownLength / canvasLengthToUnit(span, settings) });
}
export function nudgeCadSelection(editor: Editor, dx: number, dy: number, settings: CadSettings): boolean {
  if (!permitted(editor) || !validateCadSettings(settings) || ![dx, dy].every(Number.isFinite)) return false;
  const offset = { x: unitLengthToCanvas(dx, settings), y: -unitLengthToCanvas(dy, settings) };
  const selected = new Set(editor.getSelectedShapeIds());
  const ids = [...selected].filter(id => {
    let parent = editor.getShape(id)?.parentId;
    while (parent && editor.getShape(parent as any)) {
      if (selected.has(parent as any)) return false;
      parent = editor.getShape(parent as any)?.parentId;
    }
    return true;
  });
  if (!validCadPoint(offset) || ids.some(id => {
    const p = editor.getShapePageTransform(id).point(); return !validCadPoint({ x: p.x + offset.x, y: p.y + offset.y });
  })) return false;
  return drawingTransaction(editor, () => { editor.nudgeShapes(ids, offset); });
}

/** Snapshot dimensions: independent endpoints, no misleading stale association with a moved source. */
export function createCadDimension(editor: Editor, settings: CadSettings, kind: 'horizontal' | 'vertical' | 'aligned'): boolean {
  if (!validateCadSettings(settings) || !permitted(editor) || editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) return false;
  const bounds = getCadSelectionPageBounds(editor);
  if (!bounds) return false;
  let start: CadPoint = { x: bounds.minX, y: bounds.maxY }, end: CadPoint;
  if (kind === 'vertical') end = { x: bounds.minX, y: bounds.minY };
  else if (kind === 'horizontal') end = { x: bounds.maxX, y: bounds.maxY };
  else {
    const path = getCadPathPoints(editor, settings);
    if (path) { start = cadPointToCanvas(path.points[0], settings); end = cadPointToCanvas(path.points.at(-1)!, settings); }
    else end = { x: bounds.maxX, y: bounds.minY };
  }
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-8) return false;
  return drawingTransaction(editor, () => {
    const id = createShapeId();
    editor.createShape({ id, type: 'cad-dimension', parentId: editor.getCurrentPageId(), x: start.x, y: start.y,
      props: { endX: end.x - start.x, endY: end.y - start.y, offset: 24 } });
    if (!editor.getShape(id)) throw new Error('Dimension was not created');
    editor.setSelectedShapes([id]);
  });
}
