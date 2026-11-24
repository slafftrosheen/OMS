import {getSelectedCadNodes,setSelectedCadNodes} from './cad-node-selection';
import { getDefaultColorTheme, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { cadMmPerPixel, cadPointToCanvas, canvasPointToCad, validateCadSettings, type CadSettings } from './cad-settings';
import { resolveCadDraftPoint } from './cad-polyline-draft';
import {
  arcContour,
  cubicPoints,
  mapContours,
  nodeAt,
  splitCubic,
  validContours,
  type CadContour,
  type CadBezierNode
} from './cad-curves';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { VECTOR_DEFAULT_PAINT, validVectorPaint, type VectorPaint } from './cad-paint';
import { paintMetadata } from './cad-vector';
import { cadShapePaint } from './cad-shape-appearance';
import { retainCadSourceGroups } from './cad-source-groups';
import type { CadBezierShape } from './shapes/CadBezierShape';

function shapeCadLocalContours(editor: Editor, shape: TLShape, toleranceCanvas = 0.01, preserveNativeTraversal = false): CadContour[] {
  const p = shape.props as Record<string, any>;
  let contours: CadContour[];
  if (shape.type === 'cad-bezier') contours = p.contours;
  else if (shape.type === 'cad-path') contours = [{ closed: p.closed, nodes: p.points.map(nodeAt) }];
  else if (shape.type === 'line' && p.spline === 'line')
    contours = [
      {
        closed: false,
        nodes: Object.values(p.points as Record<string, CadBezierNode & { index: string }>)
          .sort((a: any, b: any) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
          .map(nodeAt)
      }
    ];
  else if (shape.type === 'cad-ellipse' || (shape.type === 'geo' && p.geo === 'ellipse' && !p.text?.trim())) {
    const w = shape.type === 'cad-ellipse' ? p.w : Math.max(1, p.w),
      h = shape.type === 'cad-ellipse' ? p.h : Math.max(1, p.h) + (p.growY ?? 0);
    const step = Math.min(Math.PI / 2, Math.pow((toleranceCanvas / Math.max(w, h)) * 10000, 1 / 6));
    // CAD ellipse SVG starts at the left and runs counterclockwise. Preserve
    // that seam/direction for conversion so dash offset keeps its visible phase.
    // The public geometry extractor retains its established traversal for other operations.
    const sourceSeam = preserveNativeTraversal && shape.type === 'cad-ellipse';
    contours = [arcContour(w / 2, h / 2, w / 2, h / 2, sourceSeam ? Math.PI : 0, (sourceSeam ? -1 : 1) * Math.PI * 2, step)];
  } else if (shape.type === 'cad-arc') {
    const step = Math.min(Math.PI / 2, Math.pow((toleranceCanvas / p.radius) * 10000, 1 / 6));
    contours = [
      arcContour(
        0,
        0,
        p.radius,
        -p.radius,
        (p.startAngle * Math.PI) / 180,
        ((p.endAngle - p.startAngle) * Math.PI) / 180,
        step
      )
    ];
  } else if (
    shape.type === 'geo' &&
    !p.text?.trim() &&
    ['rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'trapezoid', 'rhombus'].includes(
      p.geo
    )
  ) {
    const geometry = editor.getShapeGeometry(shape) as any;
    contours = [{ closed: true, nodes: (geometry.children?.[0] ?? geometry).vertices.map(nodeAt) }];
  } else throw new CadOperationError('unsupported');
  if (!validContours(contours)) throw new CadOperationError('geometry');
  return contours;
}
export function shapeCadContours(editor: Editor, shape: TLShape, toleranceCanvas = 0.01): CadContour[] {
  const contours = shapeCadLocalContours(editor, shape, toleranceCanvas);
  const matrix = editor.getShapePageTransform(shape);
  return mapContours(contours, (point) => matrix.applyToPoint(point));
}
export function cadSelectedShapes(editor: Editor, sourceRelative = false): TLShape[] {
  const ids = [...editor.getSelectedShapeIds()];
  assertCadEditable(editor, ids);
  const shapes = [...editor.getShapeAndDescendantIds(ids)]
    .map((id) => editor.getShape(id))
    .filter((s) => s && s.type !== 'group');
  if (!shapes.length || shapes.length > 200) throw new CadOperationError('selection');
  for (const shape of shapes) {
    const authored = shape.meta.omsVectorPaint;
    const paint = validVectorPaint(authored) ? authored : undefined;
    if (authored !== undefined && !paint) throw new CadOperationError('unsupported');
    if (paint?.raster && paint.raster.usage !== 'material') throw new CadOperationError('unsupported');
    if (editor.getShapeMask(shape.id)) {
      if (!sourceRelative) throw new CadOperationError('unsupported');
      let parent = editor.getShape(shape.parentId);
      const visited = new Set<TLShapeId>();
      while (parent?.type === 'group' && !visited.has(parent.id)) {
        visited.add(parent.id);
        parent = editor.getShape(parent.parentId);
      }
      if (parent?.type !== 'frame') throw new CadOperationError('unsupported');
    }
    if (!sourceRelative && (paint?.clips?.length || paint?.gradient || paint?.raster))
      throw new CadOperationError('unsupported');
  }
  return shapes;
}
export function getCadCurveSelection(
  editor: Editor,
  settings: CadSettings
): { id: string; contours: CadContour[] } | null {
  const shape = editor.getOnlySelectedShape();
  return shape?.type === 'cad-bezier'
    ? {
        id: shape.id,
        contours: mapContours(shapeCadContours(editor, shape), (point) => canvasPointToCad(point, settings))
      }
    : null;
}
function editCurve(editor: Editor, change: (contours: CadContour[]) => void, retainNodes = false): boolean {
  const shape = editor.getOnlySelectedShape();
  if (shape?.type !== 'cad-bezier') return false;
  try {
    assertCadEditable(editor, [shape.id]);
  } catch {
    return false;
  }
  const contours: CadContour[] = structuredClone((shape.props as any).contours);
  try {
    change(contours);
    if (!validContours(contours)) return false;
  } catch {
    return false;
  }
  const nodes = retainNodes ? getSelectedCadNodes(editor) : [];
  const success = drawingTransaction(editor, () => {
    editor.updateShapes([{ id: shape.id, type: shape.type, props: { contours } }]);
  });
  if (success && retainNodes) setSelectedCadNodes(editor, nodes);
  return success;
}
export function updateCadCurveNode(
  editor: Editor,
  settings: CadSettings,
  ci: number,
  ni: number,
  node: CadBezierNode
): boolean {
  const shape = editor.getOnlySelectedShape();
  if (!shape) return false;
  const local = mapContours([{ closed: false, nodes: [node, node] }], (p) =>
    editor.getPointInShapeSpace(shape, cadPointToCanvas(p, settings))
  )[0].nodes[0];
  if (local.mode !== 'corner') {
    const length = local.mode === 'symmetric' ? Math.hypot(local.outX, local.outY) : Math.hypot(local.inX, local.inY);
    const out = Math.hypot(local.outX, local.outY);
    if (out) {
      local.inX = (-local.outX / out) * length;
      local.inY = (-local.outY / out) * length;
    }
  }
  return editCurve(editor, (contours) => {
    if (!contours[ci]?.nodes[ni]) throw new Error('node');
    contours[ci].nodes[ni] = local;
  }, true);
}
/** Lines split by length fraction; cubics split exactly at parameter t. */
export function splitCadCurveSegment(editor: Editor, ci: number, ni: number, t = 0.5): boolean {
  if (!Number.isFinite(t) || t <= 0 || t >= 1 || !Number.isInteger(ci) || !Number.isInteger(ni)) return false;
  return editCurve(editor, (contours) => {
    const c = contours[ci],
      a = c.nodes[ni],
      next = (ni + 1) % c.nodes.length,
      b = c.nodes[next];
    if (!c.closed && ni === c.nodes.length - 1) throw new Error('segment');
    if (!a.outX && !a.outY && !b.inX && !b.inY) {
      c.nodes.splice(ni + 1, 0, nodeAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
      return;
    }
    const [left, right] = splitCubic(cubicPoints(a, b), t);
    a.outX = left[1].x - a.x;
    a.outY = left[1].y - a.y;
    b.inX = right[2].x - b.x;
    b.inY = right[2].y - b.y;
    // Splitting shortens one handle at each existing endpoint. Collinearity
    // survives, but equal handle lengths (symmetric mode) generally do not.
    if (a.mode === 'symmetric') a.mode = 'smooth';
    if (b.mode === 'symmetric') b.mode = 'smooth';
    c.nodes.splice(ni + 1, 0, {
      ...nodeAt(left[3]),
      inX: left[2].x - left[3].x,
      inY: left[2].y - left[3].y,
      outX: right[1].x - right[0].x,
      outY: right[1].y - right[0].y,
      mode: 'smooth'
    });
  });
}
/** Keep the start fixed; move the following anchor in physical document axes. */
export function setCadStraightSegment(editor: Editor, settings: CadSettings, ci: number, ni: number, length: number, angle: number): boolean {
  if (!validateCadSettings(settings) || !Number.isInteger(ci) || !Number.isInteger(ni)) return false;
  const shape = editor.getOnlySelectedShape();
  if (shape?.type !== 'cad-bezier') return false;
  return editCurve(editor, contours => {
    const contour = contours[ci], a = contour?.nodes[ni];
    if (!a || !contour.closed && ni === contour.nodes.length - 1) throw new Error('segment');
    const b = contour.nodes[(ni + 1) % contour.nodes.length];
    if (a.outX || a.outY || b.inX || b.inY) throw new Error('curved-segment');
    const start = editor.getShapePageTransform(shape).applyToPoint(a);
    const end = resolveCadDraftPoint('polar', length, angle, start, settings);
    if (!end) throw new Error('dimensions');
    const local = editor.getPointInShapeSpace(shape, end);
    b.x = local.x; b.y = local.y;
    // Relative controls on adjoining segments travel with their anchors.
    a.mode = b.mode = 'corner';
  }, true);
}
export function deleteCadCurveNode(editor: Editor, ci: number, ni: number): boolean {
  return deleteCadCurveNodes(editor, [{ contourIndex: ci, nodeIndex: ni }]);
}

/** Remove a node set in one history entry. A failed contour leaves every contour intact. */
export function deleteCadCurveNodes(editor: Editor, nodes: readonly { contourIndex: number; nodeIndex: number }[]): boolean {
  if (!nodes.length) return false;
  return editCurve(editor, contours => {
    const removed = new Map<number, Set<number>>();
    for (const { contourIndex, nodeIndex } of nodes) {
      if (!contours[contourIndex]?.nodes[nodeIndex]) throw new Error('node');
      const indices = removed.get(contourIndex) ?? new Set<number>();
      indices.add(nodeIndex);
      removed.set(contourIndex, indices);
    }
    for (const [index, indices] of removed) {
      const contour = contours[index];
      if (contour.nodes.length - indices.size < 2) throw new Error('node');
      contour.nodes = contour.nodes.filter((_, i) => !indices.has(i));
    }
  });
}

/** Move selected anchors in page axes and carry both relative handles. */
export function nudgeCadCurveNodes(editor: Editor, dx: number, dy: number): boolean {
  const shape = editor.getOnlySelectedShape(), nodes = getSelectedCadNodes(editor);
  if (shape?.type !== 'cad-bezier' || !nodes.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const toLocal = editor.getShapePageTransform(shape).clone().invert();
  const origin = toLocal.applyToPoint({ x: 0, y: 0 }), shifted = toLocal.applyToPoint({ x: dx, y: dy });
  return editCurve(editor, contours => {
    for (const { contourIndex, nodeIndex } of nodes) {
      const node = contours[contourIndex].nodes[nodeIndex];
      node.x += shifted.x - origin.x;
      node.y += shifted.y - origin.y;
    }
  }, true);
}
export function setCadCurveClosed(editor: Editor, ci: number, closed: boolean): boolean {
  return editCurve(editor, (contours) => {
    const contour = contours[ci];
    if (!contour || typeof closed !== 'boolean') throw new Error('contour');
    if (closed && !contour.closed && contour.nodes.length > 2) {
      const first = contour.nodes[0], last = contour.nodes.at(-1)!;
      // Break at node duplicates the seam to retain the closing cubic. Restore
      // that seam exactly; do not append a zero-length closing segment or snap
      // endpoints that are merely near each other.
      if (first.x === last.x && first.y === last.y) {
        first.inX = last.inX; first.inY = last.inY; first.mode = 'corner';
        contour.nodes.pop();
      }
    }
    contour.closed = closed;
  });
}
/** Open a closed seam, or split an open contour at an interior node. */
export function breakCadCurveAtNode(editor: Editor, ci: number, ni: number): boolean {
  return editCurve(editor, contours => {
    const contour = contours[ci];
    if (!contour || !Number.isInteger(ni) || !contour.nodes[ni]) throw new Error('node');
    const endpoint = (node: CadBezierNode, start: boolean): CadBezierNode => ({ ...node, mode: 'corner',
      ...(start ? { inX: 0, inY: 0 } : { outX: 0, outY: 0 }) });
    if (contour.closed) {
      const nodes = [...contour.nodes.slice(ni), ...contour.nodes.slice(0, ni)];
      contour.nodes = [endpoint(nodes[0], true), ...nodes.slice(1), endpoint(nodes[0], false)];
      contour.closed = false;
    } else {
      if (ni === 0 || ni === contour.nodes.length - 1) throw new Error('endpoint');
      contours.splice(ci, 1,
        { closed: false, nodes: [...contour.nodes.slice(0, ni), endpoint(contour.nodes[ni], false)] },
        { closed: false, nodes: [endpoint(contour.nodes[ni], true), ...contour.nodes.slice(ni + 1)] });
    }
  });
}
/** Only the selected outgoing segment changes; its neighbours keep their controls. */
export function setCadSegmentKind(editor: Editor, ci: number, ni: number, kind: 'line' | 'curve'): boolean {
  return editCurve(editor, contours => {
    const contour = contours[ci];
    if (!contour || !Number.isInteger(ni) || !contour.nodes[ni] || !contour.closed && ni === contour.nodes.length - 1 ||
        !['line', 'curve'].includes(kind)) throw new Error('segment');
    const a = contour.nodes[ni], b = contour.nodes[(ni + 1) % contour.nodes.length];
    // A cubic segment is already editable: never straighten it via To curve.
    if (kind === 'curve' && (a.outX || a.outY || b.inX || b.inY)) throw new Error('already-curve');
    const dx = (b.x - a.x) / 3, dy = (b.y - a.y) / 3;
    if (kind === 'curve' && dx === 0 && dy === 0) throw new Error('zero-length');
    a.outX = kind === 'line' ? 0 : dx; a.outY = kind === 'line' ? 0 : dy;
    b.inX = kind === 'line' ? 0 : -dx; b.inY = kind === 'line' ? 0 : -dy;
    a.mode = b.mode = 'corner';
  }, true);
}
/** Reverse the traversal without changing any cubic segment or the closed seam. */
export function reverseCadContour(editor: Editor, ci: number): boolean {
  return editCurve(editor, contours => {
    const contour = contours[ci];
    if (!contour) throw new Error('contour');
    const nodes = contour.nodes.map(node => ({ ...node,
      inX: node.outX, inY: node.outY, outX: node.inX, outY: node.inY
    })).reverse();
    if (contour.closed) nodes.unshift(nodes.pop()!);
    contour.nodes = nodes;
  });
}
/** Move the seam of a closed contour to an existing node; no geometric changes. */
export function setCadContourStart(editor: Editor, ci: number, ni: number): boolean {
  return editCurve(editor, contours => {
    const contour = contours[ci];
    if (!contour?.closed || !Number.isInteger(ni) || !contour.nodes[ni] || ni === 0) throw new Error('node');
    contour.nodes = [...contour.nodes.slice(ni), ...contour.nodes.slice(0, ni)];
  });
}
export type CadCurveConversionIssue = 'selection' | 'readonly' | 'locked' | 'bound' | 'unsupported' |
  'conversion-native-style' | 'conversion-native-label';
const convertibleGeo = new Set(['rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'trapezoid', 'rhombus', 'ellipse']);

function curveConversionSources(editor: Editor) {
  const selected = [...editor.getSelectedShapeIds()];
  assertCadEditable(editor, selected);
  const records = [...editor.getShapeAndDescendantIds(selected)].map(id => editor.getShape(id));
  if (!records.length || records.some(shape => !shape)) throw new CadOperationError('selection');
  if (records.some(shape => editor.getBindingsInvolvingShape(shape!.id).length)) throw new CadOperationError('bound');
  const shapes = records.filter((shape): shape is TLShape => !!shape && shape.type !== 'group');
  if (!shapes.length || shapes.length > 200) throw new CadOperationError('selection');
  for (const shape of shapes) {
    // An existing curve is already the target type. Do not rewrite its paint,
    // compound topology, clips or metadata just because it is selected too.
    if (shape.type === 'cad-bezier') continue;
    const p = shape.props as Record<string, any>, paint = shape.meta.omsVectorPaint;
    if (editor.getShapeMask(shape.id) || (paint as any)?.clips?.length || (paint as any)?.gradient || (paint as any)?.raster ||
        paint !== undefined && !validVectorPaint(paint)) throw new CadOperationError('unsupported');
    if (shape.type === 'geo' && p.text?.trim()) throw new CadOperationError('conversion-native-label');
    if (shape.type === 'geo' || shape.type === 'line') {
      if (shape.type === 'geo' && !convertibleGeo.has(p.geo) || shape.type === 'line' && p.spline !== 'line') throw new CadOperationError('unsupported');
      // Native dashed strokes fit a different dash pattern on each edge, and
      // hand-drawn/pattern styles use generated artwork. Refuse those intact.
      if (p.dash !== 'solid' || shape.type === 'geo' && !['none', 'solid', 'semi', 'fill'].includes(p.fill))
        throw new CadOperationError('conversion-native-style');
    } else if (!['cad-path', 'cad-ellipse', 'cad-arc'].includes(shape.type)) throw new CadOperationError('unsupported');
  }
  return { selected, shapes };
}
/** Pure preflight for the existing conversion controls. No source is changed. */
export function getCadCurveConversionIssue(editor: Editor): CadCurveConversionIssue | null {
  try { curveConversionSources(editor); return null; }
  catch (error) {
    return error instanceof CadOperationError && ['selection', 'readonly', 'locked', 'bound', 'unsupported', 'conversion-native-style', 'conversion-native-label'].includes(error.code)
      ? error.code as CadCurveConversionIssue : 'unsupported';
  }
}

export function convertedCurvePaint(editor: Editor, shape: TLShape): VectorPaint {
  if (shape.type !== 'geo' && shape.type !== 'line') {
    const paint = cadShapePaint(shape);
    // Legacy analytic CAD shapes without explicit paint take their stroke from
    // the active native theme in CadShapes. Capture the visible color now.
    if (!validVectorPaint(shape.meta.omsVectorPaint))
      paint.stroke = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })[(shape.props as any).color].solid;
    return paint;
  }
  const p = shape.props as any, theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() }), color = theme[p.color];
  if (p.dash !== 'solid' || shape.type === 'geo' && !['none', 'solid', 'semi', 'fill'].includes(p.fill))
    throw new CadOperationError('conversion-native-style');
  // tldraw 2.4.6's native STROKE_SIZES are not exposed by its public barrel.
  // Match GeoShapeBody/LineShapeUtil, including their stored scale. Its native
  // SVG container gives both solid styles round caps and joins.
  const size = ({ s: 2, m: 3.5, l: 5, xl: 10 } as Record<string, number>)[p.size];
  if (!color || !size || !Number.isFinite(p.scale) || p.scale <= 0) throw new CadOperationError('unsupported');
  return { ...VECTOR_DEFAULT_PAINT, dash: [], stroke: color.solid, strokeWidth: size * p.scale, lineCap: 'round', lineJoin: 'round',
    fill: shape.type === 'line' || p.fill === 'none' ? 'none' : p.fill === 'solid' ? color.semi : p.fill === 'semi' ? theme.solid : color.fill };
}

/** Replace only geometry that needs conversion. Keep object identity, local
 * coordinates, ancestry, sibling order and opacity, so Ctrl+Q does not repaint
 * or regroup a drawing. Existing curves are a genuine document/history no-op. */
export function convertSelectionToCurves(editor: Editor, settings: CadSettings): boolean {
  const finishes: Array<(committed: boolean) => void> = [];
  let committed = false;
  try {
    if (!validateCadSettings(settings)) return false;
    const { selected, shapes } = curveConversionSources(editor), targets = shapes.filter(shape => shape.type !== 'cad-bezier');
    if (!targets.length) return true;
    const revision = cadRevision(editor);
    editor.complete(); editor.setCurrentTool('select');
    if (revision !== cadRevision(editor) || getCadCurveConversionIssue(editor)) return false;
    const replacements: CadBezierShape[] = targets.map(shape => {
      const paint = convertedCurvePaint(editor, shape);
      if (!validVectorPaint(paint)) throw new CadOperationError('geometry');
      return { ...shape, type: 'cad-bezier', props: {
        contours: shapeCadLocalContours(editor, shape, .005 / cadMmPerPixel(settings), true),
        color: (shape.props as any).color ?? 'black', fillRule: (shape.props as any).fillRule ?? 'evenodd',
      }, meta: { ...structuredClone(shape.meta), omsVectorPaint: paintMetadata(paint) } } as CadBezierShape;
    });
    if (!validContours(replacements.flatMap(shape => shape.props.contours))) return false;
    if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length +
        JSON.stringify(replacements).length - JSON.stringify(targets).length > 1_900_000) return false;
    for (const parent of new Set(targets.map(shape => shape.parentId))) finishes.push(retainCadSourceGroups(editor, parent));
    committed = drawingTransaction(editor, () => {
      const replace = () => {
        // Store atomic defers native group cleanup across removal/recreation;
        // ordinary history batching alone does not. Same IDs preserve links and
        // selected group roots. Bound sources were refused before any deletion.
        editor.deleteShapes(targets.map(shape => shape.id));
        if (targets.some(shape => editor.getShape(shape.id))) throw new CadOperationError('failed');
        for (const shape of replacements) editor.createShape(shape);
        editor.setSelectedShapes(selected as TLShapeId[]);
      };
      const store = editor.store as unknown as { atomic?: (change: () => void) => void } | undefined;
      if (store?.atomic) store.atomic(replace); else replace();
      for (const expected of replacements) {
        const actual = editor.getShape(expected.id);
        if (!actual || ['type', 'parentId', 'index', 'x', 'y', 'rotation', 'opacity', 'isLocked', 'meta'].some(key =>
          JSON.stringify((actual as any)[key]) !== JSON.stringify((expected as any)[key])) ||
          Object.entries(expected.props).some(([key, value]) => JSON.stringify((actual.props as any)[key]) !== JSON.stringify(value)))
          throw new CadOperationError('failed');
      }
      if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new CadOperationError('save-limit');
    });
    return committed;
  } catch { return false; }
  finally { for (const finish of finishes.reverse()) finish(committed); }
}
