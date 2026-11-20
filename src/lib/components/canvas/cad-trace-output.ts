import type { Editor, ShapeUtil, TLGroupShape, TLOnChildrenChangeHandler, TLParentId, TLShapeId } from '@tldraw/tldraw';

type GroupHandler = TLOnChildrenChangeHandler<TLGroupShape>;
interface RetainedGroups {
  util: ShapeUtil<TLGroupShape>;
  original: GroupHandler | undefined;
  handler: GroupHandler;
  ids: Set<TLShapeId>;
}
const retainedGroups = new WeakMap<Editor, RetainedGroups>();

/** Native group normalization dissolves singleton groups during Undo without
 * preserving their opacity. Retain only singleton ancestors that existed before
 * a source-relative trace. This is editor-local runtime state, never document
 * metadata; a fresh editor establishes protection on its next trace.
 *
 * Call finish only after the transaction (including any bailToMark) has ended.
 * Successful IDs remain protected for later Undo/Redo. Failed attempts remove
 * only their newly added IDs and restore callbacks that they still own. */
export function retainTraceSourceGroups(editor: Editor, parentId: TLParentId): (committed: boolean) => void {
  const ancestors: TLShapeId[] = [], seen = new Set<TLParentId>();
  let id = parentId;
  while (id !== editor.getCurrentPageId()) {
    if (seen.has(id)) throw new Error('Invalid trace parent ancestry');
    seen.add(id);
    const parent = editor.getShape(id);
    if (!parent) throw new Error('Missing trace parent');
    if (parent.type === 'group' && editor.getSortedChildIdsForParent(parent.id).length === 1) ancestors.push(parent.id);
    id = parent.parentId;
  }
  if (!ancestors.length) return () => {};

  // Editor constructs each util with `new Util(this)`. Patch the instance only;
  // neither GroupShapeUtil.prototype nor the native history manager is changed.
  const util = editor.getShapeUtil<TLGroupShape>('group');
  if (util.editor !== editor) throw new Error('Trace group utility belongs to another editor');
  const previous = retainedGroups.get(editor);
  let state = previous;
  const installed = !state || state.util !== util || util.onChildrenChange !== state.handler;
  if (installed) {
    const ids = previous?.ids ?? new Set<TLShapeId>(), original = util.onChildrenChange;
    const handler: GroupHandler = group => {
      if (ids.has(group.id) && editor.getSortedChildIdsForParent(group.id).length === 1) return;
      return original?.call(util, group);
    };
    state = { util, original, handler, ids };
    util.onChildrenChange = handler;
    retainedGroups.set(editor, state);
  }
  const active = state!, added = ancestors.filter(groupId => !active.ids.has(groupId));
  added.forEach(groupId => active.ids.add(groupId));
  let finished = false;
  return committed => {
    if (finished) return;
    finished = true;
    if (committed) return;
    added.forEach(groupId => active.ids.delete(groupId));
    if (installed) {
      // Another feature may have wrapped/replaced the callback during the edit.
      // Never overwrite its ownership when disposing a failed trace attempt.
      if (util.onChildrenChange === active.handler) util.onChildrenChange = active.original;
      if (retainedGroups.get(editor) === active) {
        if (previous) retainedGroups.set(editor, previous);
        else retainedGroups.delete(editor);
      }
    }
  };
}
