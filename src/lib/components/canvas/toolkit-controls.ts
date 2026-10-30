import type { Editor } from '@tldraw/tldraw';

export interface ToolkitControlsState {
  tool: string;
  selected: number;
  runnable: number;
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  hasShapes: boolean;
  selectionLocked: boolean;
  canEditSelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canAlign: boolean;
  canDistribute: boolean;
  canFitSelection: boolean;
  canStyle: boolean;
  selectedImage: boolean;
  analyzableFile: { shapeId: string; fileId: string; title: string; kind: 'image' | 'pdf' } | null;
}

export const EMPTY_TOOLKIT_CONTROLS: ToolkitControlsState = {
  tool: 'select', selected: 0, runnable: 0, canUndo: false, canRedo: false,
  readOnly: false, hasShapes: false, selectionLocked: false, canEditSelection: false,
  canGroup: false, canUngroup: false, canAlign: false, canDistribute: false,
  canFitSelection: false, canStyle: true, selectedImage: false, analyzableFile: null
};

/** Reads editor state only; camera/selection changes never enter the shared document. */
export function captureToolkitControls(editor: Editor, geo = 'rectangle', runnable = 0): ToolkitControlsState {
  const selected = editor.getSelectedShapes();
  const ids = selected.map(shape => shape.id);
  const relatedIds = editor.getShapeAndDescendantIds(ids);
  // Moving or deleting a group also affects its descendants. Do not enable a
  // command which would silently ignore some locked members of the selection.
  const selectionLocked = [...relatedIds].some(id => {
    const shape = editor.getShape(id);
    return !!shape && editor.isShapeOrAncestorLocked(shape);
  });
  const readOnly = editor.getInstanceState().isReadonly;
  const canEditSelection = !!selected.length && !readOnly && !selectionLocked;
  const tool = editor.getCurrentToolId();
  const file = selected.find(shape => {
    const props = shape.props as Record<string, unknown>;
    return shape.type === 'document' && ['image', 'pdf'].includes(String(props.kind)) &&
      typeof props.fileId === 'string' && props.fileId.length > 0;
  });
  const fileProps = file?.props as Record<string, unknown> | undefined;
  return {
    tool: tool === 'geo' ? geo : tool,
    selected: selected.length,
    runnable: readOnly ? 0 : runnable,
    canUndo: !readOnly && editor.getCanUndo(),
    canRedo: !readOnly && editor.getCanRedo(),
    readOnly,
    hasShapes: editor.getCurrentPageShapeIds().size > 0,
    selectionLocked,
    canEditSelection,
    canGroup: canEditSelection && selected.length >= 2,
    canUngroup: canEditSelection && selected.some(shape => shape.type === 'group'),
    canAlign: canEditSelection && selected.length >= 2,
    canDistribute: canEditSelection && selected.length >= 3,
    canFitSelection: selected.length > 0,
    canStyle: !readOnly && !selectionLocked && !['hand', 'eraser', 'zoom', 'laser'].includes(tool),
    selectedImage: selected.some(shape => {
      const props = shape.props as Record<string, unknown>;
      return shape.type === 'document' && props.kind === 'image' && typeof props.url === 'string' && !!props.url;
    }),
    analyzableFile: file && fileProps ? {
      shapeId: file.id, fileId: String(fileProps.fileId), title: String(fileProps.title ?? ''),
      kind: fileProps.kind as 'image' | 'pdf'
    } : null
  };
}

const alignments = {
  'align-left': 'left', 'align-center': 'center-horizontal', 'align-right': 'right',
  'align-top': 'top', 'align-middle': 'center-vertical', 'align-bottom': 'bottom'
} as const;
let commandSequence = 0;

function canApplySelectionCommand(state: ToolkitControlsState, action: string): boolean {
  if (!state.canEditSelection) return false;
  if (['duplicate', 'delete', 'front', 'back'].includes(action)) return true;
  if (action === 'group') return state.canGroup;
  if (action === 'ungroup') return state.canUngroup;
  if (Object.hasOwn(alignments, action)) return state.canAlign;
  return ['distribute-horizontal', 'distribute-vertical'].includes(action) && state.canDistribute;
}

/** Apply a human dock command against fresh state, not a stale button snapshot. */
export function applyToolkitToolbarAction(editor: Editor | null, action: string): boolean {
  if (!editor) return false;
  const state = captureToolkitControls(editor);
  if (action === 'fit' && state.hasShapes) editor.zoomToFit();
  else if (action === 'fit-selection' && state.canFitSelection) editor.zoomToSelection();
  else if (action === 'zoom-reset') editor.resetZoom();
  else if (action === 'undo' && state.canUndo) editor.undo();
  else if (action === 'redo' && state.canRedo) editor.redo();
  else {
    if (!canApplySelectionCommand(state, action)) return false;
    // Native group/ungroup silently refuse outside Select. Finish the user's
    // gesture before the dock's history boundary, then recheck what is selected.
    editor.complete();
    editor.setCurrentTool('select');
    const current = captureToolkitControls(editor);
    if (!canApplySelectionCommand(current, action)) return false;
    const ids = [...editor.getSelectedShapeIds()];
    let operation: (() => void) | undefined;
    if (current.canEditSelection) {
      if (action === 'duplicate') operation = () => { editor.duplicateShapes(ids, { x: 24, y: 24 }); };
      else if (action === 'delete') operation = () => { editor.deleteShapes(ids); };
      else if (action === 'front') operation = () => { editor.bringToFront(ids); };
      else if (action === 'back') operation = () => { editor.sendToBack(ids); };
      else if (action === 'group' && current.canGroup) operation = () => {
        editor.groupShapes(ids);
        const group = editor.getSelectedShapes().find(shape => shape.type === 'group' && !ids.includes(shape.id));
        if (!group || ids.some(id => editor.getShape(id)?.parentId !== group.id)) {
          throw new Error('Canvas grouping was not applied');
        }
      };
      else if (action === 'ungroup' && current.canUngroup) {
        const groups = ids.filter(id => editor.getShape(id)?.type === 'group');
        operation = () => {
          editor.ungroupShapes(ids);
          if (groups.some(id => editor.getShape(id)) || ids.some(id => !groups.includes(id) && !editor.getShape(id))) {
            throw new Error('Canvas ungrouping was not applied');
          }
        };
      }
      else if (Object.hasOwn(alignments, action) && current.canAlign) {
        operation = () => { editor.alignShapes(ids, alignments[action as keyof typeof alignments]); };
      } else if (current.canDistribute && ['distribute-horizontal', 'distribute-vertical'].includes(action)) {
        operation = () => { editor.distributeShapes(ids, action === 'distribute-horizontal' ? 'horizontal' : 'vertical'); };
      }
    }
    if (!operation) return false;
    const mark = `toolkit-dock-${++commandSequence}`;
    editor.mark(mark);
    try {
      editor.run(operation);
      editor.mark(`${mark}-complete`);
    } catch {
      editor.bailToMark(mark);
      return false;
    }
  }
  editor.focus();
  return true;
}
