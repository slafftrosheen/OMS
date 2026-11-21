import { validVectorPaint } from './cad-paint';
import { createShapeId, getIndicesBetween, type Editor, type TLParentId, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { cadMmPerPixel, validateCadSettings, type CadSettings } from './cad-settings';
import { curveBounds, validContours, type CadContour } from './cad-curves';
import { retainCadSourceGroups } from './cad-source-groups';

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
  /** Insert at this source’s stacking position, in its parent’s coordinate space. */
  aboveSourceId?: TLShapeId;
  /** Explicit opacity prevents the active drawing style multiplying imported paint alpha. */
  opacity?: number;
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
  /** Preserve each painted object; grouping never combines contours or paint. */
  groupResult?: boolean;
  groupName?: string;
  /** Geometry/paint must already be expressed in this source parent's space. */
  placement?: { parentId: TLParentId; aboveId: TLShapeId };
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
    const seen = new Set<string>();
    let ancestor = editor.getShape(shape.parentId as TLShapeId);
    while (ancestor && !seen.has(ancestor.id)) {
      if (['order-details', 'order-address', 'profile-7st'].includes(ancestor.type)) throw new CadOperationError('locked');
      seen.add(ancestor.id);
      ancestor = editor.getShape(ancestor.parentId as TLShapeId);
    }
  }
}
/** The preview of many independent shapes has a separate aggregate budget.
 * Each persisted Bézier shape still has the ordinary per-object limits. */
export function validCadPlanContours(contours: CadContour[], shapes?: CadPlannedShape[]): boolean {
  if (!shapes?.length) return validContours(contours);
  return validContours(contours, { maxContours: 2000, maxNodes: 20_000 }) &&
    shapes.every(shape => shape.type !== 'cad-bezier' || validContours(shape.props.contours as CadContour[]));
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

/** A placement is anchored to a reviewed source, not an arbitrary destination.
 * Check ancestry before native lock traversal, including malformed cycles or
 * foreign-page parents. Generic plans retain their page-root placement. */
function cadPlanPlacement(editor: Editor, plan: CadPlan, aboveId: TLShapeId, expectedParent?: TLParentId) {
  if (!plan.sourceIds.includes(aboveId)) throw new CadOperationError('placement');
  const above = editor.getShape(aboveId);
  if (!above || expectedParent !== undefined && above.parentId !== expectedParent)
    throw new CadOperationError('placement');
  let id = above.parentId;
  const seen = new Set<string>([above.id]);
  while (id !== editor.getCurrentPageId()) {
    if (seen.has(id) || plan.removeIds.includes(id)) throw new CadOperationError('placement');
    seen.add(id);
    const parent = editor.getShape(id as TLShapeId);
    if (!parent || !['group', 'frame'].includes(parent.type)) throw new CadOperationError('placement');
    id = parent.parentId;
  }
  const parentId = above.parentId;
  const nextSibling = editor.getSortedChildIdsForParent(parentId).map(id => editor.getShape(id))
    .find(shape => shape && shape.index > above.index);
  return { parentId, above, nextSibling, indices: [] as TLShape['index'][] };
}

export function applyCadPlan(editor: Editor, plan: CadPlan): boolean {
  try {
    if (plan.placement !== undefined) {
      if (!plan.placement || typeof plan.placement.parentId !== 'string') return false;
      cadPlanPlacement(editor, plan, plan.placement.aboveId, plan.placement.parentId);
    }
    assertCadEditable(editor, plan.sourceIds);
    editor.complete();
    editor.setCurrentTool('select');
    assertCadEditable(editor, plan.sourceIds);
    if (plan.blocked) return false;
    if (plan.revision !== cadRevision(editor) || !validCadPlanContours(plan.contours, plan.shapes)) return false;
    if (plan.groupResult !== undefined && typeof plan.groupResult !== 'boolean') return false;
    if (plan.groupName !== undefined && (typeof plan.groupName !== 'string' || !plan.groupName.trim())) return false;
    if (
      plan.removeIds.some(
        (id) => !plan.sourceIds.includes(id) || editor.getBindingsInvolvingShape(id as TLShapeId).length
      )
    )
      return false;
    const source = plan.sourceIds.length ? editor.getShape(plan.sourceIds.at(-1) as TLShapeId) : undefined;
    const shapes: CadPlannedShape[] = plan.shapes ?? [
      {
        type: 'cad-bezier' as const,
        x: 0,
        y: 0,
        props: { contours: plan.contours, fillRule: plan.fillRule ?? 'evenodd', color: (source?.props as any)?.color ?? 'black' },
        meta: source?.meta.omsVectorPaint ? { omsVectorPaint: source.meta.omsVectorPaint } : undefined
      }
    ];
    const grouped = plan.groupResult === true && shapes.length > 1;
    const groupName = plan.groupName ?? plan.name;
    const groupRecord = grouped ? { type: 'group', meta: { omsObjectName: groupName } } : undefined;
    if (
      !shapes.length ||
      shapes.length > 2000 ||
      editor.getCurrentPageShapeIds().size + shapes.length + Number(grouped) > editor.options.maxShapesPerPage
    )
      return false;
    if(shapes.some(s=>s.meta?.omsVectorPaint && !validVectorPaint(s.meta.omsVectorPaint)))return false;
    if (shapes.some(s => s.opacity !== undefined && (!Number.isFinite(s.opacity) || s.opacity < 0 || s.opacity > 1))) return false;
    // Shared order/idea documents have a 2 MB persistence limit. Embedded PDF
    // bitmaps must fail before mutation, rather than create an unsaveable board.
    if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(shapes).length +
        (groupRecord ? JSON.stringify(groupRecord).length : 0) > 1_900_000) return false;
    const anchorCounts = new Map<TLShapeId, number>();
    for (const shape of shapes) {
      if (shape.aboveSourceId && (plan.placement || grouped)) return false;
      const anchor = shape.aboveSourceId ?? plan.placement?.aboveId;
      if (anchor) anchorCounts.set(anchor, (anchorCounts.get(anchor) ?? 0) + 1);
    }
    const placements = new Map([...anchorCounts].map(([id, count]) => {
      const placement = cadPlanPlacement(editor, plan, id, plan.placement?.parentId);
      placement.indices = getIndicesBetween(placement.above.index, placement.nextSibling?.index, count);
      return [id, placement] as const;
    }));
    const parentId = plan.placement?.parentId ?? editor.getCurrentPageId();
    const placedParents = new Set([...placements.values()].map(placement => placement.parentId));
    const finishGroups: Array<(committed: boolean) => void> = [];
    let committed = false;
    try {
      for (const parent of placedParents) {
        const removing = plan.removeIds.filter(id => editor.getShape(id as TLShapeId)?.parentId === parent).length;
        const adding = [...placements.values()].filter(placement => placement.parentId === parent)
          .reduce((count, placement) => count + placement.indices.length, 0);
        const finalChildCount = editor.getSortedChildIdsForParent(parent).length - removing + (grouped ? 1 : adding);
        finishGroups.push(retainCadSourceGroups(editor, parent, finalChildCount === 1));
      }
      committed = drawingTransaction(editor, () => {
        const ids = shapes.map(({ aboveSourceId, ...s }) => {
          const anchor = aboveSourceId ?? plan.placement?.aboveId;
          const placement = anchor ? placements.get(anchor) : undefined;
          const id = createShapeId(), destination = placement?.parentId ?? parentId;
          editor.createShape({
            ...s,
            id,
            parentId: destination,
            ...(placement ? { index: placement.indices.shift() } : {}),
            meta: { ...s.meta, omsObjectName: s.meta?.omsObjectName ?? plan.name }
          } as any);
          const created = editor.getShape(id);
          if (!created || (placement || grouped) && created.parentId !== destination) throw new CadOperationError('capacity');
          return id;
        });
        let selected = ids;
        if (grouped) {
          const groupId = createShapeId();
          editor.groupShapes(ids, { groupId, select: false });
          const group = editor.getShape(groupId);
          if (!group || group.type !== 'group' || group.parentId !== parentId || group.opacity !== 1 ||
              ids.some(id => editor.getShape(id)?.parentId !== groupId) || editor.getSortedChildIdsForParent(groupId).length !== ids.length)
            throw new CadOperationError('group');
          editor.updateShape({ id: groupId, type: 'group', meta: { ...group.meta, omsObjectName: groupName } });
          if (editor.getShape(groupId)?.meta.omsObjectName !== groupName) throw new CadOperationError('group');
          selected = [groupId];
        }
        editor.deleteShapes(plan.removeIds as TLShapeId[]);
        if (selected.some((id, i) => {
          const anchor = (grouped ? undefined : shapes[i].aboveSourceId) ?? plan.placement?.aboveId;
          const placement = anchor && placements.get(anchor);
          if (!placement) return false;
          const shape = editor.getShape(id);
          return !shape || shape.parentId !== placement.parentId || shape.index <= placement.above.index ||
            !!placement.nextSibling && shape.index >= placement.nextSibling.index;
        })) throw new CadOperationError('placement');
        // Include native defaults and grouping in the saved-size check.
        if ((grouped || placements.size) && editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000)
          throw new CadOperationError('save-limit');
        if ((grouped || placements.size) && editor.getCurrentPageShapeIds().size > editor.options.maxShapesPerPage)
          throw new CadOperationError('capacity');
        editor.setSelectedShapes(selected);
      });
      return committed;
    } finally {
      for (const finish of finishGroups.reverse()) finish(committed);
    }
  } catch {
    return false;
  }
}
