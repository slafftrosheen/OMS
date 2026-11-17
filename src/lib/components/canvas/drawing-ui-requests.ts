import type { Editor } from '@tldraw/tldraw';

// Editor-local navigation keeps a menu in one drawing from opening another
// drawing's docker. Commands still run through DrawingChrome's fresh guards.
export const DRAWING_UI_REQUEST = 'oms:drawing-ui-request';
const commands = ['undo', 'redo', 'duplicate', 'delete', 'group', 'ungroup', 'front', 'back',
  'forward', 'backward', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical',
  'lock', 'fit', 'fit-selection', 'select-all'] as const;
const panels = ['properties', 'objects', 'text', 'transform', 'align', 'repeat', 'radial'] as const;
const cad = ['nodes', 'convert', 'outline', 'paint', 'outlineObject', 'document'] as const;
const objects = ['relative', 'reverse'] as const;
export type DrawingUiRequest =
  | { kind: 'command'; action: typeof commands[number] }
  | { kind: 'panel'; action: typeof panels[number] }
  | { kind: 'cad'; action: typeof cad[number] }
  | { kind: 'objects'; action: typeof objects[number] };

export function isDrawingUiRequest(value: unknown): value is DrawingUiRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as { kind?: unknown; action?: unknown };
  const actions: readonly string[] | undefined = request.kind === 'command' ? commands
    : request.kind === 'panel' ? panels : request.kind === 'cad' ? cad : request.kind === 'objects' ? objects : undefined;
  return typeof request.action === 'string' && !!actions?.includes(request.action);
}

export function requestDrawingUi(editor: Editor, request: DrawingUiRequest): void {
  editor.getContainer().dispatchEvent(new CustomEvent(DRAWING_UI_REQUEST, { detail: request }));
}
