import type { Editor } from '@tldraw/tldraw';

// Editor-local navigation keeps a menu in one drawing from opening another
// drawing's docker. Commands still run through DrawingChrome's fresh guards.
export const DRAWING_UI_REQUEST = 'oms:drawing-ui-request';
const commands = ['undo', 'redo', 'duplicate', 'delete', 'group', 'ungroup', 'front', 'back',
  'forward', 'backward', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical',
  'lock', 'fit', 'fit-selection', 'select-all'] as const;
const panels = ['properties', 'objects', 'text', 'transform', 'align', 'repeat', 'radial', 'guides'] as const;
const cad = ['nodes', 'convert', 'outline', 'paint', 'outlineObject', 'document', 'importDxf', 'importVector'] as const;
const objects = ['relative', 'reverse'] as const;
export type DrawingUiRequest =
  | { kind: 'command'; action: typeof commands[number] }
  | { kind: 'panel'; action: typeof panels[number] }
  | { kind: 'cad'; action: typeof cad[number]; file?: File }
  | { kind: 'objects'; action: typeof objects[number] };

export function isDrawingUiRequest(value: unknown): value is DrawingUiRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as { kind?: unknown; action?: unknown; file?: unknown };
  if (typeof request.action !== 'string') return false;
  if (request.file !== undefined &&
      (request.kind !== 'cad' || !['importDxf', 'importVector'].includes(request.action) ||
        typeof File === 'undefined' || !(request.file instanceof File))) return false;
  const actions: readonly string[] | undefined = request.kind === 'command' ? commands
    : request.kind === 'panel' ? panels : request.kind === 'cad' ? cad : request.kind === 'objects' ? objects : undefined;
  return !!actions?.includes(request.action);
}

export function requestDrawingUi(editor: Editor, request: DrawingUiRequest): void {
  editor.getContainer().dispatchEvent(new CustomEvent(DRAWING_UI_REQUEST, { detail: request }));
}

/** A single production drawing on the work area opens a review before insertion. */
export function routeCanvasCadImport(editor: Editor, files: readonly File[]): boolean {
  if (files.length !== 1 || editor.getInstanceState().isReadonly) return false;
  const [file] = files;
  const action = /\.dxf$/i.test(file.name) ? 'importDxf' : /\.(?:eps|cdr)$/i.test(file.name) ? 'importVector' : null;
  if (!action) return false;
  requestDrawingUi(editor, { kind: 'cad', action, file });
  return true;
}
