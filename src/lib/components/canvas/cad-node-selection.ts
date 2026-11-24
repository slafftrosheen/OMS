import { atom, type Editor, type TLEventInfo } from '@tldraw/tldraw';
import type { CadContour } from './cad-curves';
import type { CadBezierShape } from './shapes/CadBezierShape';

export interface CadNodeSelection { shapeId: string; contourIndex: number; nodeIndex: number }
interface NodeSet { shapeId: string; geometry: string; nodes: CadNodeSelection[] }
function selectionAtom() { return atom<NodeSet | null>('CAD selected nodes', null); }
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

/** Geometry identity prevents shifted indices after split/delete/reverse/undo.
 * This UI state is never persisted in the document. */
export function getSelectedCadNodes(editor: Editor): CadNodeSelection[] {
  const shape = editor.getOnlySelectedShape() as CadBezierShape | undefined;
  if (shape?.type !== 'cad-bezier') return [];
  const saved = selection(editor).get();
  if (!saved) return [{ shapeId: shape.id, contourIndex: 0, nodeIndex: 0 }];
  if (saved.shapeId !== shape.id || saved.geometry !== JSON.stringify(shape.props.contours)) return [];
  return saved.nodes;
}
/** Legacy inspector always has a valid node, independent of the batch set. */
export function getSelectedCadNode(editor: Editor): CadNodeSelection | null {
  const shape = editor.getOnlySelectedShape() as CadBezierShape | undefined;
  if (shape?.type !== 'cad-bezier') return null;
  return getSelectedCadNodes(editor).at(-1) ?? { shapeId: shape.id, contourIndex: 0, nodeIndex: 0 };
}
export function setSelectedCadNodes(editor: Editor, nodes: ReadonlyArray<{contourIndex:number;nodeIndex:number}>): boolean {
  const shape = editor.getOnlySelectedShape() as CadBezierShape | undefined;
  if (shape?.type !== 'cad-bezier' || nodes.length > 4096 ||
      nodes.some(n => !Number.isInteger(n.contourIndex) || !Number.isInteger(n.nodeIndex) || !shape.props.contours[n.contourIndex]?.nodes[n.nodeIndex])) return false;
  const unique = new Map(nodes.map(n => [n.contourIndex + ':' + n.nodeIndex, { shapeId: shape.id, contourIndex: n.contourIndex, nodeIndex: n.nodeIndex }]));
  selection(editor).set({shapeId:shape.id,geometry:JSON.stringify(shape.props.contours),nodes:[...unique.values()]});
  return true;
}
export function selectCadNode(editor: Editor, contourIndex: number, nodeIndex: number): boolean {
  return setSelectedCadNodes(editor,[{contourIndex,nodeIndex}]);
}
export function selectAllCadNodes(editor: Editor): boolean {
  const shape = editor.getOnlySelectedShape() as CadBezierShape | undefined;
  return shape?.type === 'cad-bezier' && setSelectedCadNodes(editor,
    shape.props.contours.flatMap((contour, contourIndex) => contour.nodes.map((_, nodeIndex) => ({ contourIndex, nodeIndex }))));
}

export function toggleCadNode(editor: Editor, contourIndex: number, nodeIndex: number): boolean {
  const nodes=getSelectedCadNodes(editor), exists=nodes.some(n=>n.contourIndex===contourIndex&&n.nodeIndex===nodeIndex);
  return setSelectedCadNodes(editor,exists?nodes.filter(n=>n.contourIndex!==contourIndex||n.nodeIndex!==nodeIndex):[...nodes,{contourIndex,nodeIndex}]);
}

/** A native handle drag changes coordinates, not topology. Preserve the set
 * only when it still describes the exact current document before that update. */
export function retainCadNodesAfterHandleDrag(editor: Editor, contours: CadContour[]): void {
  const shape=editor.getOnlySelectedShape() as CadBezierShape|undefined, saved=selection(editor).get();
  if(shape?.type!=='cad-bezier'||saved?.shapeId!==shape.id||saved.geometry!==JSON.stringify(shape.props.contours))return;
  selection(editor).set({...saved,geometry:JSON.stringify(contours)});
}

/** Observe native handle presses without taking focus or interrupting dragging. */
export function inspectCadNodeEvent(editor: Editor, event: TLEventInfo): void {
  if (event.type !== 'pointer' || event.name !== 'pointer_down' || event.button !== 0 ||
      event.target !== 'handle' || event.shape.type !== 'cad-bezier' ||
      editor.getOnlySelectedShape()?.id !== event.shape.id) return;
  const match = /^(\d+):(\d+):(node|in|out)$/.exec(event.handle.id);
  if (!match) return;
  const node = { contourIndex: Number(match[1]), nodeIndex: Number(match[2]) };
  if (event.shiftKey && match[3] === 'node') {
    toggleCadNode(editor, node.contourIndex, node.nodeIndex);
    return;
  }
  const selected = getSelectedCadNodes(editor);
  const others = selected.filter(value => value.contourIndex !== node.contourIndex || value.nodeIndex !== node.nodeIndex);
  if (match[3] === 'node' && others.length < selected.length) setSelectedCadNodes(editor, [...others, node]);
  else selectCadNode(editor, node.contourIndex, node.nodeIndex);
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
