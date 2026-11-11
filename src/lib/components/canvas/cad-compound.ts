import type { Editor } from '@tldraw/tldraw';
import { cadSelectedShapes, shapeCadContours } from './cad-editing';
import { cadMmPerPixel, type CadSettings } from './cad-settings';
import { applyCadPlan, CadOperationError, makeCadPlan, type CadPlan } from './cad-plans';

export type CadCompoundOperation = 'combine' | 'breakApart';

/** Compound editing retains cubic controls. It never performs a polygon union. */
export function prepareCadCompound(editor: Editor, settings: CadSettings, operation: CadCompoundOperation): CadPlan {
  const shapes = cadSelectedShapes(editor);
  const rules = shapes.map(shape => (shape.props as any).fillRule ?? 'evenodd');
  if (operation === 'combine' && shapes.length < 2) throw new CadOperationError('selection');
  // Combining font winding with even-odd CAD paths would silently change holes.
  if (operation === 'combine' && new Set(rules).size !== 1) throw new CadOperationError('fill-rule');
  if (operation === 'breakApart' && (shapes.some(shape => shape.type !== 'cad-bezier') ||
      !shapes.some(shape => (shape.props as any).contours.length > 1))) throw new CadOperationError('selection');
  const sources = shapes.map(shape => shapeCadContours(editor, shape, 0.005 / cadMmPerPixel(settings)));
  const contours = sources.flat();
  const last = shapes[shapes.length - 1];
  const ids = shapes.map(shape => shape.id);
  return makeCadPlan(editor, settings, contours, {
    sourceIds: ids, removeIds: ids, fillRule: rules[0],
    name: operation === 'combine' ? 'Combined curve' : 'Curve contour',
    shapes: operation === 'combine' ? [{
      type: 'cad-bezier', x: 0, y: 0,
      props: { contours, color: (last.props as any).color ?? 'black', fillRule: rules[0] },
      meta: { ...last.meta }
    }] : shapes.flatMap((shape, index) => sources[index].map((contour, part) => ({
      type: 'cad-bezier' as const, x: 0, y: 0,
      props: { contours: [contour], color: (shape.props as any).color ?? 'black', fillRule: rules[index] },
      meta: { ...shape.meta, omsObjectName: `${shape.meta?.omsObjectName ?? 'Curve'} · ${part + 1}` }
    })))
  });
}

export function applyCadCompound(editor: Editor, settings: CadSettings, operation: CadCompoundOperation): boolean {
  try { return applyCadPlan(editor, prepareCadCompound(editor, settings, operation)); }
  catch { return false; }
}
