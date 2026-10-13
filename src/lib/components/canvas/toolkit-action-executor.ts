/** Client-side Toolkit edit executors. All calls require an explicit user click.
 * Only proposal-safe shapes may be mutated; no order records or technical tools.
 */
import type { CanvasAction } from './toolkit-skills';
const KINDS = ['idea', 'research', 'decision', 'task', 'note'];
export function actionSummary(action: CanvasAction, lookup: (id: string) => string) {
  switch (action.kind) {
    case 'connect': return `Connect "${lookup(action.from)}" → "${lookup(action.to)}"`;
    case 'revise': return `Revise "${lookup(action.target)}"`;
    case 'layout': return `Arrange idea cards as ${action.layout}`;
  }
}
function ideaShape(editor: any, id: string) {
  const shape = editor?.getShape?.(id);
  return shape?.type === 'idea-card' ? shape : null;
}
export function applyToolkitAction(editor: any, action: CanvasAction): { ok: boolean; detail: string } {
  if (!editor) return { ok: false, detail: 'Canvas is not ready' };
  if (action.kind === 'revise') {
    const shape = ideaShape(editor, action.target);
    if (!shape) return { ok: false, detail: 'Target card was deleted or changed' };
    const patch: Record<string, unknown> = {};
    if (action.title.trim()) patch.title = action.title.trim();
    if (action.body.trim()) patch.body = action.body.trim();
    if (action.state && ['open','in-progress','done'].includes(action.state)) patch.state = action.state;
    if (!Object.keys(patch).length) return { ok: false, detail: 'No valid changes proposed' };
    editor.updateShape({ id: shape.id, type: 'idea-card', props: patch });
    return { ok: true, detail: 'Card updated' };
  }
  if (action.kind === 'connect') {
    const from = ideaShape(editor, action.from), to = ideaShape(editor, action.to);
    if (!from || !to || from.id === to.id) {
      return { ok: false, detail: 'Both cards must still exist' };
    }
    const shapes = editor.getCurrentPageShapes?.() ?? [];
    const exists = shapes.filter((s: any) => s.type === 'arrow').some((arrow: any) => {
      const bindings = editor.getBindingsFromShape?.(arrow.id, 'arrow') ?? [];
      const a = bindings.find((v: any) => v.props?.terminal === 'start')?.toId;
      const b = bindings.find((v: any) => v.props?.terminal === 'end')?.toId;
      return a === from.id && b === to.id;
    });
    if (exists) return { ok: false, detail: 'Connection already exists' };
    const start = editor.getShapePageBounds(from.id)?.center;
    const end = editor.getShapePageBounds(to.id)?.center;
    if (!start || !end || typeof editor.createBindings !== 'function') {
      return { ok: false, detail: 'This canvas does not support bound arrows' };
    }
    // crypto.randomUUID() is unavailable on the current plain-HTTP Tailnet
    // origin. getRandomValues works without a secure context.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = `shape:${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    const create = () => {
      editor.createShape({ id, type: 'arrow', x: start.x, y: start.y,
        props: { start: { x: 0, y: 0 }, end: { x: end.x - start.x, y: end.y - start.y } } });
      editor.createBindings([
        { type: 'arrow', fromId: id, toId: from.id, props: {
          terminal: 'start', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } },
        { type: 'arrow', fromId: id, toId: to.id, props: {
          terminal: 'end', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } }
      ]);
    };
    if (typeof editor.run === 'function') editor.run(create); else create();
    return { ok: true, detail: 'Bound arrow created' };
  }
  if (action.kind === 'layout') {
    const shapes = (editor.getCurrentPageShapes?.() ?? []).filter((s: any) =>
      s.type === 'idea-card' && KINDS.includes(s.props?.kind)).slice(0, 70);
    if (shapes.length < 2) return { ok: false, detail: 'Add at least two idea cards first' };
    const columns = action.layout === 'columns' ? KINDS.length : Math.min(4, Math.ceil(Math.sqrt(shapes.length)));
    const origin = editor.getViewportPageBounds?.().center ?? { x: 0, y: 0 };
    const newPositions = shapes.map((shape: any, index: number) => {
      const col = action.layout === 'columns'
        ? KINDS.indexOf(shape.props.kind) : index % columns;
      const row = action.layout === 'columns'
        ? shapes.slice(0, index).filter((x: any) => x.props.kind === shape.props.kind).length
        : Math.floor(index / columns);
      return { id: shape.id, type: shape.type, x: origin.x - 540 + col * 330,
        y: origin.y - 200 + row * 260 };
    });
    editor.updateShapes(newPositions);
    editor.zoomToFit?.();
    return { ok: true, detail: 'Idea cards arranged (drawings and media unchanged)' };
  }
  return { ok: false, detail: 'Unknown proposal' };
}
