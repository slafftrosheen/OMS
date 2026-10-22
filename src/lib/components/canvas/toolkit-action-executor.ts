/** Explicitly reviewed Canvas edits. Preflight the complete proposal set, then
 * apply in one history transaction. No network requests or order data writes. */
import { canvasActionTargets, normalizeCanvasActions, normalizeEditableProps, type CanvasAction, MAX_CANVAS_ACTIONS } from './toolkit-actions';
import { captureToolkitScene, canvasShapeVersion, EDITABLE_CANVAS_TYPES, PROTECTED_CANVAS_TYPES } from './toolkit-scene';
import { canvasLinkShapeProps } from './toolkit-media-url';
import { ideaDefaults } from './idea-model';

type Translate = (key: string, vars?: Record<string, string | number>) => string;
export type ToolkitApplyResult = { ok: boolean; detail: string; messageKey: string; count?: number };
const KINDS = ['idea', 'research', 'decision', 'task', 'note'];
const english: Record<string, string> = {
  notReady: 'Canvas is not ready', readonly: 'This canvas is read-only', invalid: 'This proposal contains unsupported changes',
  stale: 'The target changed after this suggestion. Ask the assistant to refresh its proposal.',
  protected: 'Locked shapes and order forms cannot be changed by the assistant',
  missing: 'A target was deleted or moved to another page', pageChanged: 'This proposal belongs to another canvas page',
  unsupported: 'This editor does not support that operation', failed: 'The changes could not be applied; the canvas was restored',
  duplicateConnection: 'This connection already exists', applied: 'Canvas changes applied. Undo is available.',
  empty: 'There are no changes to apply'
};
function result(code: string, ok = false, count?: number): ToolkitApplyResult {
  return { ok, detail: english[code] ?? english.failed, messageKey: `canvas.editResult.${code}`, ...(count === undefined ? {} : { count }) };
}

export function actionSummary(action: CanvasAction, lookup: (id: string) => string, translate?: Translate) {
  const count = canvasActionTargets(action).length;
  const values: Record<string, string | number> = { count, type: action.kind === 'create' ? action.shape.type : '',
    title: 'target' in action ? lookup(action.target) : '',
    from: action.kind === 'connect' ? lookup(action.from) : '', to: action.kind === 'connect' ? lookup(action.to) : '',
    layout: action.kind === 'layout' ? action.layout : '' };
  if (translate) return translate(`canvas.editActions.${action.kind}`, values);
  switch (action.kind) {
    case 'connect': return `Connect “${values.from}” → “${values.to}”`;
    case 'revise': return `Revise “${values.title}”`;
    case 'layout': return `Arrange idea cards as ${action.layout}`;
    case 'create': return `Create ${action.shape.type}`;
    case 'update': return `Edit “${values.title}”`;
    case 'resize': return `Resize “${values.title}”`;
    default: return `${action.kind[0].toUpperCase()}${action.kind.slice(1)} ${count} shapes`;
  }
}
function newShapeId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `shape:${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
function affectedShapes(all: any[], targets: string[]) {
  const affected = new Set(targets);
  let changed = true;
  while (changed) {
    changed = false;
    for (const shape of all) if (affected.has(shape.parentId) && !affected.has(shape.id)) {
      affected.add(shape.id); changed = true;
    }
  }
  return all.filter(shape => affected.has(shape.id));
}
function ancestorsOf(all: any[], shapes: any[]) {
  const map = new Map(all.map(shape => [shape.id, shape]));
  const ancestors = new Map<string, any>();
  for (const shape of shapes) {
    let parent = map.get(shape.parentId);
    const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id); ancestors.set(parent.id, parent); parent = map.get(parent.parentId);
    }
  }
  return [...ancestors.values()];
}
function blocked(shape: any) {
  return !EDITABLE_CANVAS_TYPES.has(shape?.type) || PROTECTED_CANVAS_TYPES.has(shape?.type) || shape?.isLocked === true;
}
function actionIds(action: CanvasAction, all: any[]) {
  if (action.kind === 'layout' && !action.targets) return all.filter(shape => shape?.type === 'idea-card' && !blocked(shape)).slice(0, 40).map(shape => shape.id);
  return canvasActionTargets(action);
}
function preflight(editor: any, actions: CanvasAction[]): ToolkitApplyResult | null {
  if (!editor || typeof editor.getCurrentPageShapes !== 'function') return result('notReady');
  if (editor.getInstanceState?.()?.isReadonly) return result('readonly');
  if (!actions.length) return result('empty');
  if (actions.length > MAX_CANVAS_ACTIONS || actions.some(action => !action || typeof action !== 'object')) return result('invalid');
  const all: any[] = editor.getCurrentPageShapes();
  const allIds = new Set(all.map(shape => shape.id));
  const requested = actions.flatMap(action => actionIds(action, all));
  const scene = captureToolkitScene({
    getCurrentPageShapes: () => all, getSelectedShapeIds: () => requested,
    getCurrentPageId: () => editor.getCurrentPageId?.(),
    getShapePageBounds: (id: string) => editor.getShapePageBounds?.(id),
    getBindingsFromShape: (id: string, type: string) => editor.getBindingsFromShape?.(id, type),
    getAsset: (id: string) => editor.getAsset?.(id), getViewportPageBounds: () => editor.getViewportPageBounds?.()
  });
  const deleted = new Set<string>();
  for (const action of actions) {
    if (action.pageId && action.pageId !== editor.getCurrentPageId?.()) return result('pageChanged');
    const targets = actionIds(action, all);
    if (targets.some(id => !allIds.has(id) || deleted.has(id))) return result('missing');
    const affected = affectedShapes(all, targets);
    const related = [...affected, ...ancestorsOf(all, affected)];
    if (related.some(blocked)) return result('protected');
    if (action.expected) {
      if (related.some(shape => action.expected![shape.id] !== canvasShapeVersion(shape))) return result('stale');
      if (Object.keys(action.expected).some(id => !related.some(shape => shape.id === id))) return result('stale');
    } else if (!['revise','connect','layout','create'].includes(action.kind)) return result('stale');
    if (!normalizeCanvasActions([action], scene).length) return result('invalid');
    if (action.kind === 'layout' && targets.length < 2) return result('empty');
    if (action.kind === 'delete') for (const shape of affected) deleted.add(shape.id);
    if (action.kind === 'connect') {
      if (typeof editor.createBindings !== 'function' || !editor.getShapePageBounds?.(action.from) || !editor.getShapePageBounds?.(action.to)) return result('unsupported');
      const exists = all.filter(shape => shape.type === 'arrow').some(arrow => {
        const bindings = editor.getBindingsFromShape?.(arrow.id, 'arrow') ?? [];
        return bindings.find((binding: any) => binding.props?.terminal === 'start')?.toId === action.from &&
          bindings.find((binding: any) => binding.props?.terminal === 'end')?.toId === action.to;
      });
      if (exists) return result('duplicateConnection');
    }
    const method: Partial<Record<CanvasAction['kind'], string>> = {
      create: 'createShape', update: 'updateShape', revise: 'updateShape', move: 'nudgeShapes', resize: 'resizeShape',
      delete: 'deleteShapes', duplicate: 'duplicateShapes', group: 'groupShapes', ungroup: 'ungroupShapes',
      align: 'alignShapes', distribute: 'distributeShapes', layout: 'updateShapes'
    };
    if (method[action.kind] && typeof editor[method[action.kind]!] !== 'function') return result('unsupported');
    if (action.kind === 'reorder') {
      const methods = { front: 'bringToFront', back: 'sendToBack', forward: 'bringForward', backward: 'sendBackward' };
      if (typeof editor[methods[action.position]] !== 'function') return result('unsupported');
    }
    if (action.kind === 'resize') {
      const bounds = editor.getShapeGeometry?.(action.target)?.bounds;
      if (!bounds?.w || !bounds?.h) return result('unsupported');
    }
  }
  if (typeof editor.run !== 'function' || typeof editor.mark !== 'function' || typeof editor.bailToMark !== 'function') return result('unsupported');
  return null;
}
function execute(editor: any, action: CanvasAction) {
  switch (action.kind) {
    case 'create': {
      let props = action.shape.props;
      if (action.shape.type === 'idea-card') props = { ...ideaDefaults((props.kind as any) ?? 'idea'), ...props };
      if (action.shape.type === 'document' && props.url) {
        const media = canvasLinkShapeProps(props.url);
        if (!media) throw new Error('Invalid media URL');
        props = { ...media, ...props };
      }
      editor.createShape({ ...action.shape, id: newShapeId(), parentId: editor.getCurrentPageId(), props });
      break;
    }
    case 'update': {
      const shape = editor.getShape(action.target);
      const props = action.patch.props ? normalizeEditableProps(shape.type, action.patch.props) : undefined;
      if (action.patch.props && !props) throw new Error('Invalid shape properties');
      editor.updateShape({ id: shape.id, type: shape.type, ...action.patch, ...(props ? { props } : {}) });
      break;
    }
    case 'revise': {
      const shape = editor.getShape(action.target);
      editor.updateShape({ id: shape.id, type: 'idea-card', props: {
        title: action.title, body: action.body, ...(action.state ? { state: action.state } : {}) } });
      break;
    }
    case 'move': editor.nudgeShapes(action.targets, { x: action.dx, y: action.dy }); break;
    case 'resize': {
      const bounds = editor.getShapeGeometry(action.target).bounds;
      editor.resizeShape(action.target, { x: action.width / bounds.w, y: action.height / bounds.h });
      break;
    }
    case 'delete': editor.deleteShapes(action.targets); break;
    case 'duplicate': editor.duplicateShapes(action.targets, { x: action.dx, y: action.dy }); break;
    case 'group': editor.groupShapes(action.targets); break;
    case 'ungroup': editor.ungroupShapes(action.targets); break;
    case 'align': editor.alignShapes(action.targets, action.alignment); break;
    case 'distribute': editor.distributeShapes(action.targets, action.axis); break;
    case 'reorder': {
      const methods = { front: 'bringToFront', back: 'sendToBack', forward: 'bringForward', backward: 'sendBackward' };
      editor[methods[action.position]](action.targets); break;
    }
    case 'connect': {
      const start = editor.getShapePageBounds(action.from).center;
      const end = editor.getShapePageBounds(action.to).center;
      const id = newShapeId();
      editor.createShape({ id, type: 'arrow', parentId: editor.getCurrentPageId(), x: start.x, y: start.y,
        props: { start: { x: 0, y: 0 }, end: { x: end.x - start.x, y: end.y - start.y }, text: action.label ?? '' } });
      editor.createBindings([
        { type: 'arrow', fromId: id, toId: action.from, props: { terminal: 'start', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } },
        { type: 'arrow', fromId: id, toId: action.to, props: { terminal: 'end', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } }
      ]);
      break;
    }
    case 'layout': {
      const all = editor.getCurrentPageShapes();
      const ids = new Set(actionIds(action, all));
      const shapes = all.filter((shape: any) => ids.has(shape.id));
      const columns = action.layout === 'columns' ? KINDS.length : Math.min(4, Math.ceil(Math.sqrt(shapes.length)));
      const origin = editor.getViewportPageBounds?.().center ?? { x: 0, y: 0 };
      const newPositions = shapes.map((shape: any, index: number) => {
        const col = action.layout === 'columns' ? Math.max(0, KINDS.indexOf(shape.props.kind)) : index % columns;
        const row = action.layout === 'columns' ? shapes.slice(0, index).filter((other: any) => other.props.kind === shape.props.kind).length : Math.floor(index / columns);
        const page = { x: origin.x - 540 + col * 330, y: origin.y - 200 + row * 260 };
        const local = editor.getPointInParentSpace?.(shape, page) ?? page;
        return { id: shape.id, type: shape.type, x: local.x, y: local.y };
      });
      editor.updateShapes(newPositions);
      break;
    }
  }
}
/** One click, one undo step, all-or-nothing on errors. */
export function applyToolkitActions(editor: any, actions: CanvasAction[]): ToolkitApplyResult {
  const validated = normalizeCanvasActions(actions);
  if (validated.length !== actions.length) return result('invalid');
  const problem = preflight(editor, validated);
  if (problem) return problem;
  const mark = `toolkit-assistant-${newShapeId().slice(6)}`;
  editor.mark(mark);
  try {
    editor.run(() => { for (const action of validated) execute(editor, action); });
    editor.mark(`${mark}-complete`);
    return result('applied', true, actions.length);
  } catch {
    editor.bailToMark(mark);
    return result('failed');
  }
}
export function applyToolkitAction(editor: any, action: CanvasAction): ToolkitApplyResult {
  return applyToolkitActions(editor, [action]);
}
