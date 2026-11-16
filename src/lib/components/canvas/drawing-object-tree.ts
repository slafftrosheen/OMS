import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { drawingObjectName } from './drawing-operations';
import { drawingTransaction } from './drawing-commands';

export interface DrawingObjectRow {
  shape: TLShape;
  parent: TLShapeId | null;
  depth: number;
  children: number;
  expanded: boolean;
  matched: boolean;
  position: number;
  siblings: number;
}

/** Object indices are local to their parent, never a single global stack. */
export function drawingObjectTree(shapes: readonly TLShape[], collapsed: ReadonlySet<TLShapeId>, search = ''): DrawingObjectRow[] {
  const byId = new Map(shapes.map(shape => [shape.id, shape]));
  const children = new Map<TLShapeId | null, TLShape[]>();
  for (const shape of shapes) {
    const parent = byId.has(shape.parentId as TLShapeId) && shape.parentId !== shape.id ? shape.parentId as TLShapeId : null;
    const list = children.get(parent) ?? [];
    list.push(shape); children.set(parent, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.index < b.index ? 1 : a.index > b.index ? -1 : a.id.localeCompare(b.id));
  const query = search.trim().toLocaleLowerCase();
  const matches = new Set(shapes.filter(shape => !query || drawingObjectName(shape).toLocaleLowerCase().includes(query)).map(shape => shape.id));
  const included = new Set(matches);
  // A matching child always brings its ancestor context; a matching group is
  // shown with its contents. Searching never changes the saved collapsed state.
  if (query) {
    for (const id of matches) for (const parent of ancestorsFromMap(byId, id)) included.add(parent);
    const pending = [...matches];
    const visited = new Set<TLShapeId>();
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const child of children.get(id) ?? []) { included.add(child.id); pending.push(child.id); }
    }
  }
  const rows: DrawingObjectRow[] = [], visited = new Set<TLShapeId>();
  const append = (roots: TLShape[]) => {
    const pending: Array<{ shape: TLShape; parent: TLShapeId | null; depth: number; position: number; siblings: number }> = [];
    const add = (list: TLShape[], parent: TLShapeId | null, depth: number) => {
      const visible = list.filter(shape => included.has(shape.id));
      for (let index = visible.length - 1; index >= 0; index--) pending.push({ shape: visible[index], parent, depth, position: index + 1, siblings: visible.length });
    };
    add(roots, null, 0);
    while (pending.length) {
      const item = pending.pop()!;
      if (visited.has(item.shape.id)) continue;
      visited.add(item.shape.id);
      const own = children.get(item.shape.id) ?? [];
      const expanded = !!query || !collapsed.has(item.shape.id);
      rows.push({ ...item, children: own.length, expanded, matched: matches.has(item.shape.id) });
      if (expanded) add(own, item.shape.id, item.depth + 1);
      else {
        // Mark collapsed descendants as visited so they cannot become orphan roots.
        const hidden = [...own];
        while (hidden.length) { const child = hidden.pop()!; if (visited.has(child.id)) continue; visited.add(child.id); hidden.push(...children.get(child.id) ?? []); }
      }
    }
  };
  append(children.get(null) ?? []);
  // Broken imported ancestry must remain inspectable, without infinite loops.
  for (const shape of shapes) if (!visited.has(shape.id) && included.has(shape.id)) append([shape]);
  return rows;
}

export function drawingObjectAncestors(shapes: readonly TLShape[], id: TLShapeId): TLShapeId[] {
  return ancestorsFromMap(new Map(shapes.map(shape => [shape.id, shape])), id);
}
function ancestorsFromMap(byId: ReadonlyMap<TLShapeId, TLShape>, id: TLShapeId): TLShapeId[] {
  const result: TLShapeId[] = [], seen = new Set<TLShapeId>([id]);
  let parent = byId.get(id)?.parentId as TLShapeId | undefined;
  while (parent && byId.has(parent) && !seen.has(parent)) { result.push(parent); seen.add(parent); parent = byId.get(parent)?.parentId as TLShapeId | undefined; }
  return result;
}

export interface ObjectSelectionOptions { toggle?: boolean; range?: boolean; anchor?: TLShapeId | null; }
/** Ranges follow visible rows. A selected ancestor covers its descendants. */
export function resolveObjectTreeSelection(shapes: readonly TLShape[], visible: readonly TLShapeId[], selected: readonly TLShapeId[], target: TLShapeId, options: ObjectSelectionOptions = {}): TLShapeId[] {
  const byId = new Map(shapes.map(shape => [shape.id, shape]));
  const valid = new Set(byId.keys());
  if (!valid.has(target) || !visible.includes(target)) return [...selected].filter(id => valid.has(id));
  let next: TLShapeId[];
  const a = options.anchor ? visible.indexOf(options.anchor) : -1, b = visible.indexOf(target);
  if (options.range && a >= 0) next = [...(options.toggle ? selected : []), ...visible.slice(Math.min(a, b), Math.max(a, b) + 1)];
  else if (options.toggle) {
    if (selected.includes(target)) next = selected.filter(id => id !== target);
    else {
      const ancestors = new Set(ancestorsFromMap(byId, target));
      next = [...selected.filter(id => !ancestors.has(id) && !ancestorsFromMap(byId, id).includes(target)), target];
    }
  } else next = [target];
  const unique = new Set(next.filter(id => valid.has(id)));
  return [...unique].filter(id => !ancestorsFromMap(byId, id).some(parent => unique.has(parent)));
}

export function selectDrawingObject(editor: Editor, visible: readonly TLShapeId[], target: TLShapeId, options: ObjectSelectionOptions = {}): boolean {
  if (!editor.getCurrentPageShapeIds().has(target)) return false;
  editor.complete(); editor.setCurrentTool('select');
  const shapes = editor.getCurrentPageShapesSorted();
  if (!shapes.some(shape => shape.id === target)) return false;
  editor.setSelectedShapes(resolveObjectTreeSelection(shapes, visible, editor.getSelectedShapeIds(), target, options));
  return true;
}

export type ObjectStackAction = 'front' | 'back' | 'forward' | 'backward';
export function canReorderDrawingObjects(editor: Editor): boolean {
  const shapes = editor.getSelectedShapes();
  if (editor.getInstanceState().isReadonly || !shapes.length || new Set(shapes.map(shape => shape.parentId)).size !== 1) return false;
  const page = editor.getCurrentPageShapeIds();
  return [...editor.getShapeAndDescendantIds(shapes.map(shape => shape.id))].every(id => page.has(id) && !!editor.getShape(id) && !editor.isShapeOrAncestorLocked(id));
}
/** The native 2.4 stacking operations modify only sibling indices. No reparenting. */
export function reorderDrawingObjects(editor: Editor, action: ObjectStackAction): boolean {
  if (!['front', 'back', 'forward', 'backward'].includes(action) || !canReorderDrawingObjects(editor)) return false;
  editor.complete(); editor.setCurrentTool('select');
  if (!canReorderDrawingObjects(editor)) return false;
  const ids = [...editor.getSelectedShapeIds()];
  return drawingTransaction(editor, () => {
    if (action === 'front') editor.bringToFront(ids);
    else if (action === 'back') editor.sendToBack(ids);
    else if (action === 'forward') editor.bringForward(ids);
    else editor.sendBackward(ids);
  });
}
