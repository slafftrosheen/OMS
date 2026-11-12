import { atom, type Editor, type TLEventInfo } from '@tldraw/tldraw';
import type { CadBezierShape } from './shapes/CadBezierShape';

export interface CadNodeSelection { shapeId: string; contourIndex: number; nodeIndex: number }
function selectionAtom() { return atom<CadNodeSelection | null>('CAD selected node', null); }
const selections = new WeakMap<Editor, ReturnType<typeof selectionAtom>>();
function editingAtom() { return atom('CAD node editing', false); }
const modes = new WeakMap<Editor, ReturnType<typeof editingAtom>>();
function editing(editor: Editor) {
  let value = modes.get(editor);
  if (!value) { value = editingAtom(); modes.set(editor, value); }
  return value;
}
export function isCadNodeEditing(editor: Editor): boolean { return editing(editor).get() && editor.getCurrentToolId() === 'select'; }
export function setCadNodeEditing(editor: Editor, enabled: boolean): void { editing(editor).set(enabled); }
function selection(editor: Editor) {
  let value = selections.get(editor);
  if (!value) { value = selectionAtom(); selections.set(editor, value); }
  return value;
}

/** Editor-local inspection state, never part of the document or its undo history. */
export function getSelectedCadNode(editor: Editor): CadNodeSelection | null {
  const shape = editor.getOnlySelectedShape() as CadBezierShape | undefined;
  if (shape?.type !== 'cad-bezier') return null;
  const saved = selection(editor).get();
  if (saved?.shapeId === shape.id && shape.props.contours[saved.contourIndex]?.nodes[saved.nodeIndex]) return saved;
  return { shapeId: shape.id, contourIndex: 0, nodeIndex: 0 };
}

export function selectCadNode(editor: Editor, contourIndex: number, nodeIndex: number): boolean {
  const shape = editor.getOnlySelectedShape() as CadBezierShape | undefined;
  if (shape?.type !== 'cad-bezier' || !Number.isInteger(contourIndex) || !Number.isInteger(nodeIndex) ||
      !shape.props.contours[contourIndex]?.nodes[nodeIndex]) return false;
  const current = selection(editor).get();
  if (current?.shapeId !== shape.id || current.contourIndex !== contourIndex || current.nodeIndex !== nodeIndex)
    selection(editor).set({ shapeId: shape.id, contourIndex, nodeIndex });
  return true;
}

/** Observe native handle presses without taking focus or interrupting dragging. */
export function inspectCadNodeEvent(editor: Editor, event: TLEventInfo): void {
  if (event.type !== 'pointer' || event.name !== 'pointer_down' || event.button !== 0 ||
      event.target !== 'handle' || event.shape.type !== 'cad-bezier' ||
      editor.getOnlySelectedShape()?.id !== event.shape.id) return;
  const match = /^(\d+):(\d+):(node|in|out)$/.exec(event.handle.id);
  if (match) selectCadNode(editor, Number(match[1]), Number(match[2]));
}

export function installCadNodeSelection(editor: Editor): () => void {
  const listener = (event: TLEventInfo) => {
    if (editor.getCurrentToolId() !== 'select' || event.type === 'keyboard' && event.name === 'key_down' &&
        !event.ctrlKey && !event.altKey && ['v', 'Escape'].includes(event.key)) setCadNodeEditing(editor, false);
    inspectCadNodeEvent(editor, event);
  };
  editor.on('event', listener);
  return () => { editor.off('event', listener); };
}
