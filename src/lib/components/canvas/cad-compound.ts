import type { Editor } from '@tldraw/tldraw';
import type { CadBezierShape } from './shapes/CadBezierShape';
import { cadSelectedShapes, shapeCadContours } from './cad-editing';
import { cadMmPerPixel, type CadSettings } from './cad-settings';
import { applyCadPlan, CadOperationError, makeCadPlan, type CadPlan } from './cad-plans';
import { assertCadMergeContext, cadReferencePaintWarnings, sourceCurveResult } from './cad-source-result';

export type CadCompoundOperation = 'combine' | 'breakApart';

/** Combine keeps the last source's appearance. Break Apart retains each
 * compound's own appearance, transform and sibling position. */
export function prepareCadCompound(editor: Editor, settings: CadSettings, operation: CadCompoundOperation): CadPlan {
  const shapes = cadSelectedShapes(editor, true);
  const rules = shapes.map(shape => (shape.props as { fillRule?: 'evenodd' | 'nonzero' }).fillRule ?? 'evenodd');
  if (operation === 'combine' && shapes.length < 2) throw new CadOperationError('selection');
  if (operation === 'combine' && new Set(rules).size !== 1) throw new CadOperationError('fill-rule');
  if (operation === 'breakApart' && (shapes.some(shape => shape.type !== 'cad-bezier') ||
      !shapes.some(shape => (shape.props as any).contours.length > 1))) throw new CadOperationError('selection');
  const reference = shapes.at(-1)!;
  if (operation === 'combine') assertCadMergeContext(shapes, reference);
  const sources = shapes.map(shape => shapeCadContours(editor, shape, 0.005 / cadMmPerPixel(settings)));
  const contours = sources.flat();
  const ids = shapes.map(shape => shape.id);
  return makeCadPlan(editor, settings, contours, {
    sourceIds: ids, removeIds: ids, fillRule: rules[0],
    name: operation === 'combine' ? 'Combined curve' : 'Curve contour',
    warnings: operation === 'combine' ? cadReferencePaintWarnings(editor, shapes, reference) : [],
    shapes: operation === 'combine'
      ? [sourceCurveResult(editor, reference, contours, rules[0])]
      : shapes.flatMap((shape, index) => (shape as CadBezierShape).props.contours.map((contour, part) => {
        const result = sourceCurveResult(editor, shape, [contour], rules[index], undefined, 'local');
        result.meta = { ...result.meta, omsObjectName: `${shape.meta.omsObjectName ?? 'Curve'} · ${part + 1}` };
        return result;
      }))
  });
}

export function applyCadCompound(
  editor: Editor,
  settings: CadSettings,
  operation: CadCompoundOperation,
  report?: (code: string) => void
): boolean {
  try {
    const plan = prepareCadCompound(editor, settings, operation);
    const applied = applyCadPlan(editor, plan);
    if (applied && plan.warnings.length) report?.(plan.warnings[0]);
    return applied;
  } catch (error) {
    if (error instanceof CadOperationError) report?.(error.code);
    return false;
  }
}
