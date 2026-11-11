import { type Editor, type TLShape } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { cadMmPerPixel, cadPointToCanvas, canvasPointToCad, type CadSettings } from './cad-settings';
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
import { assertCadEditable, applyCadPlan, makeCadPlan, CadOperationError } from './cad-plans';

export function shapeCadContours(editor: Editor, shape: TLShape, toleranceCanvas = 0.01): CadContour[] {
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
    contours = [arcContour(w / 2, h / 2, w / 2, h / 2, 0, Math.PI * 2, step)];
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
  const matrix = editor.getShapePageTransform(shape);
  return mapContours(contours, (point) => matrix.applyToPoint(point));
}
export function cadSelectedShapes(editor: Editor): TLShape[] {
  const ids = [...editor.getSelectedShapeIds()];
  assertCadEditable(editor, ids);
  const shapes = [...editor.getShapeAndDescendantIds(ids)]
    .map((id) => editor.getShape(id))
    .filter((s) => s && s.type !== 'group');
  if (!shapes.length || shapes.length > 200) throw new CadOperationError('selection');
  // Refuse potentially clipped CAD rather than applying operations to invisible areas.
  if (shapes.some((s) => editor.getShapeMask(s.id))) throw new CadOperationError('unsupported');
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
function editCurve(editor: Editor, change: (contours: CadContour[]) => void): boolean {
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
  return drawingTransaction(editor, () => {
    editor.updateShapes([{ id: shape.id, type: shape.type, props: { contours } }]);
  });
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
  });
}
export function splitCadCurveSegment(editor: Editor, ci: number, ni: number): boolean {
  return editCurve(editor, (contours) => {
    const c = contours[ci],
      a = c.nodes[ni],
      next = (ni + 1) % c.nodes.length,
      b = c.nodes[next];
    if (!c.closed && ni === c.nodes.length - 1) throw new Error('segment');
    const [left, right] = splitCubic(cubicPoints(a, b));
    a.outX = left[1].x - a.x;
    a.outY = left[1].y - a.y;
    b.inX = right[2].x - b.x;
    b.inY = right[2].y - b.y;
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
export function deleteCadCurveNode(editor: Editor, ci: number, ni: number): boolean {
  return editCurve(editor, (contours) => {
    if (!contours[ci]?.nodes[ni] || contours[ci].nodes.length <= 2) throw new Error('node');
    contours[ci].nodes.splice(ni, 1);
  });
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
  });
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
export function convertSelectionToCurves(editor: Editor, settings: CadSettings): boolean {
  try {
    const shapes = cadSelectedShapes(editor),
      ids = shapes.map((s) => s.id),
      sourceContours = shapes.map((s) => shapeCadContours(editor, s, 0.005 / cadMmPerPixel(settings))),
      contours = sourceContours.flat();
    if (shapes.some((s) => editor.getBindingsInvolvingShape(s.id).length)) return false;
    return applyCadPlan(
      editor,
      makeCadPlan(editor, settings, contours, {
        sourceIds: ids,
        removeIds: ids,
        name: 'CAD curves',
        // Winding-based font regions must not become an even-odd compound when
        // converting a selected group. Keep those source regions separate.
        shapes: shapes.some((s) => (s.props as any).fillRule === 'nonzero' || s.meta.omsVectorPaint)
          ? shapes.map((shape, i) => ({
              type: 'cad-bezier' as const,
              x: 0,
              y: 0,
              props: {
                contours: sourceContours[i],
                color: (shape.props as any).color ?? 'black',
                fillRule: (shape.props as any).fillRule ?? 'evenodd'
              },
              meta: { ...shape.meta }
            }))
          : undefined,
        warnings: ['curves-approximated']
      })
    );
  } catch {
    return false;
  }
}
