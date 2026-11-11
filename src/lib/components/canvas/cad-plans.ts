import { validVectorPaint } from './cad-paint';
import { createShapeId, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { cadMmPerPixel, validateCadSettings, type CadSettings } from './cad-settings';
import { curveBounds, validContours, type CadContour } from './cad-curves';

export class CadOperationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export interface CadPlannedShape {
  type: 'cad-bezier' | 'cad-path' | 'cad-ellipse' | 'cad-arc';
  x: number;
  y: number;
  rotation?: number;
  props: Record<string, unknown>;
  meta?: Record<string, any>;
}
export interface CadPlan {
  revision: string;
  contours: CadContour[];
  fillRule?: 'evenodd' | 'nonzero';
  sourceIds: string[];
  removeIds: string[];
  name: string;
  warnings: string[];
  widthMm: number;
  heightMm: number;
  shapes?: CadPlannedShape[];
  blocked?: boolean;
}
export function cadRevision(editor: Editor): string {
  return JSON.stringify([editor.getCurrentPage(), editor.getCurrentPageShapesSorted(), editor.getSelectedShapeIds()]);
}
export function assertCadEditable(editor: Editor, ids: string[] = []): void {
  if (editor.getInstanceState().isReadonly) throw new CadOperationError('readonly');
  for (const id of editor.getShapeAndDescendantIds(ids as TLShapeId[])) {
    const shape = editor.getShape(id);
    if (
      !shape ||
      editor.isShapeOrAncestorLocked(shape) ||
      ['order-details', 'order-address', 'profile-7st'].includes(shape.type)
    )
      throw new CadOperationError('locked');
  }
}
export function makeCadPlan(
  editor: Editor,
  settings: CadSettings,
  contours: CadContour[],
  options: Partial<CadPlan> = {}
): CadPlan {
  if (!validateCadSettings(settings) || !validContours(contours)) throw new CadOperationError('geometry');
  const bounds = curveBounds(contours),
    factor = cadMmPerPixel(settings);
  return {
    revision: cadRevision(editor),
    contours,
    sourceIds: [],
    removeIds: [],
    name: 'CAD',
    warnings: [],
    widthMm: bounds.w * factor,
    heightMm: bounds.h * factor,
    ...options
  };
}
export function applyCadPlan(editor: Editor, plan: CadPlan): boolean {
  try {
    assertCadEditable(editor, plan.sourceIds);
    editor.complete();
    editor.setCurrentTool('select');
    assertCadEditable(editor, plan.sourceIds);
    if (plan.blocked) return false;
    if (plan.revision !== cadRevision(editor) || !validContours(plan.contours)) return false;
    if (
      plan.removeIds.some(
        (id) => !plan.sourceIds.includes(id) || editor.getBindingsInvolvingShape(id as TLShapeId).length
      )
    )
      return false;
    const source = plan.sourceIds.length ? editor.getShape(plan.sourceIds.at(-1) as TLShapeId) : undefined;
    const shapes = plan.shapes ?? [
      {
        type: 'cad-bezier' as const,
        x: 0,
        y: 0,
        props: { contours: plan.contours, fillRule: plan.fillRule ?? 'evenodd', color: (source?.props as any)?.color ?? 'black' },
        meta: source?.meta.omsVectorPaint ? { omsVectorPaint: source.meta.omsVectorPaint } : undefined
      }
    ];
    if (
      !shapes.length ||
      shapes.length > 2000 ||
      editor.getCurrentPageShapeIds().size + shapes.length > editor.options.maxShapesPerPage
    )
      return false;
    if(shapes.some(s=>s.meta?.omsVectorPaint && !validVectorPaint(s.meta.omsVectorPaint)))return false;
    // Shared order/idea documents have a 2 MB persistence limit. Embedded PDF
    // bitmaps must fail before mutation, rather than create an unsaveable board.
    if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(shapes).length > 1_900_000) return false;
    return drawingTransaction(editor, () => {
      const ids = shapes.map((s) => {
        const id = createShapeId();
        editor.createShape({
          ...s,
          id,
          parentId: editor.getCurrentPageId(),
          meta: { ...s.meta, omsObjectName: s.meta?.omsObjectName ?? plan.name }
        } as any);
        if (!editor.getShape(id)) throw new CadOperationError('capacity');
        return id;
      });
      editor.deleteShapes(plan.removeIds as TLShapeId[]);
      editor.setSelectedShapes(ids);
    });
  } catch {
    return false;
  }
}
