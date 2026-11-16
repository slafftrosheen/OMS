import type { Editor, TLShapeId } from '@tldraw/tldraw';

type Draft = { id: TLShapeId; props: Record<string, unknown> | null } | null;
const drafts = new WeakMap<Editor, () => Draft>();

/** A tool describes committed geometry without completing the user's gesture.
 * null props omit a placeholder; a props patch removes pointer-only previews. */
export function registerCanvasDraft(editor: Editor, read: () => Draft) {
  drafts.set(editor, read);
  return () => { if (drafts.get(editor) === read) drafts.delete(editor); };
}

/** Document-only persistence boundary, shared by autosave and recovery.
 * Never mutate the live store, history, selection or current drawing tool. */
export function captureCanvasDocument(editor: Editor) {
  const document = editor.store.getStoreSnapshot();
  const draft = drafts.get(editor)?.();
  if (!draft || !document.store[draft.id]) return { document };
  const store = { ...document.store }, shape = store[draft.id];
  if (shape.typeName !== 'shape') return { document };
  if (draft.props) store[draft.id] = { ...shape, props: { ...shape.props, ...draft.props } } as typeof shape;
  else {
    delete store[draft.id];
    for (const [id, record] of Object.entries(store)) {
      if (record.typeName === 'binding' && (record.fromId === draft.id || record.toId === draft.id)) delete store[id as keyof typeof store];
    }
  }
  return { document: { ...document, store } };
}
