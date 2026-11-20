import type { Editor } from '@tldraw/tldraw';
import { hasCanvasDraft } from './canvas-document';
import { CAD_CURVE_NODE_LIMIT, mapContours, validContours, type CadContour } from './cad-curves';
import { getSelectedCadNodes, setSelectedCadNodes, type CadNodeSelection } from './cad-node-selection';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { reduceCadGeometry } from './cad-reduce-geometry';
import { retainCadSourceGroups } from './cad-source-groups';
import { cadMmPerPixel, readCadSettings } from './cad-settings';
import { drawingTransaction } from './drawing-commands';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';
import type { CadBezierShape } from './shapes/CadBezierShape';

export type NodeReductionOptions = { tolerance: number; selectedOnly: boolean };
export interface NodeReductionPlan {
  revision: string;
  options: NodeReductionOptions;
  selected: CadNodeSelection[];
  remainingSelection: CadNodeSelection[];
  source: CadContour[];
  result: CadContour[];
  local: CadContour[];
  before: number;
  removed: number;
  error: number;
  unit: 'mm' | 'px';
  limited: boolean;
}

export function nodeReductionTolerance(unit: 'mm' | 'px') {
  return unit === 'mm' ? { min: .001, max: 1 } : { min: .01, max: 10 };
}

export function prepareNodeReduction(editor: Editor, options: NodeReductionOptions): NodeReductionPlan {
  const shape = editor.getOnlySelectedShape() as CadBezierShape | null;
  if (shape?.type !== 'cad-bezier' || !validContours(shape.props.contours)) throw new CadOperationError('selection');
  assertCadEditable(editor, [shape.id]);
  if (editor.getShapeMask(shape.id) || (shape.meta.omsVectorPaint as { clips?: unknown[] } | undefined)?.clips?.length)
    throw new CadOperationError('unsupported');
  if (editor.getBindingsInvolvingShape(shape.id).length) throw new CadOperationError('bound');

  const settings = readCadSettings(editor), unit = settings ? 'mm' : 'px';
  const { min, max } = nodeReductionTolerance(unit);
  if (!options || !Number.isFinite(options.tolerance) || options.tolerance < min || options.tolerance > max ||
      typeof options.selectedOnly !== 'boolean') throw new CadOperationError('geometry');
  const selected = getSelectedCadNodes(editor);
  if (options.selectedOnly && !selected.length) throw new CadOperationError('selection');
  const address = (contour: number, node: number) => contour * CAD_CURVE_NODE_LIMIT + node;
  const selectedIndices = new Set(selected.map(node => address(node.contourIndex, node.nodeIndex)));
  // Tldraw's page transform is rigid. Shape resizing is already in the local
  // control points. Zoom and group rotation therefore never change the bound.
  const factor = settings ? cadMmPerPixel(settings) : 1;
  const reduced = reduceCadGeometry(shape.props.contours, options.tolerance / factor * (1 - 1e-12),
    (ci, ni) => !options.selectedOnly || selectedIndices.has(address(ci, ni)));
  if (!validContours(reduced.contours)) throw new CadOperationError('geometry');
  const survivingIndices = new Map<number, number>();
  reduced.indices.forEach((indices, ci) => indices.forEach((old, index) => survivingIndices.set(address(ci, old), index)));
  const remainingSelection = selected.flatMap(node => {
    const index = survivingIndices.get(address(node.contourIndex, node.nodeIndex));
    return index === undefined ? [] : [{ ...node, nodeIndex: index }];
  });
  const matrix = editor.getShapePageTransform(shape);
  return {
    revision: cadRevision(editor), options: { ...options }, selected: structuredClone(selected), remainingSelection,
    source: mapContours(shape.props.contours, p => matrix.applyToPoint(p)),
    result: mapContours(reduced.contours, p => matrix.applyToPoint(p)),
    local: reduced.contours, before: shape.props.contours.reduce((sum, contour) => sum + contour.nodes.length, 0),
    removed: reduced.removed, error: reduced.error * factor, unit, limited: reduced.limited
  };
}

export function applyNodeReduction(editor: Editor, reviewed: NodeReductionPlan): boolean {
  try {
    if (!editor.isIn('select.idle') || hasCanvasDraft(editor) || isDrawingPointerGestureActive(editor) ||
        reviewed.revision !== cadRevision(editor) ||
        JSON.stringify(reviewed.selected) !== JSON.stringify(getSelectedCadNodes(editor))) return false;
    const fresh = prepareNodeReduction(editor, reviewed.options);
    if (!fresh.removed || JSON.stringify(reviewed.local) !== JSON.stringify(fresh.local)) return false;
    const shape = editor.getOnlySelectedShape() as CadBezierShape;
    const finishGroups = retainCadSourceGroups(editor, shape.parentId);
    let committed = false;
    try {
      committed = drawingTransaction(editor, () => {
        const expected = { ...shape, props: { ...shape.props, contours: fresh.local } };
        editor.updateShape({ id: shape.id, type: shape.type, props: { contours: fresh.local } });
        const actual = editor.getShape(shape.id);
        if (!actual || Object.entries(expected).some(([key, value]) =>
          JSON.stringify(Reflect.get(actual, key)) !== JSON.stringify(value))) throw new CadOperationError('geometry');
      });
      if (committed) setSelectedCadNodes(editor, fresh.remainingSelection);
      return committed;
    } finally { finishGroups(committed); }
  } catch { return false; }
}
