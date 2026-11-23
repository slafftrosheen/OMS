import type { Editor } from '@tldraw/tldraw';
import type { CadPoint } from './cad-settings';
import { drawingFileKind } from './drawing-file-types';

// Editor-local navigation keeps a menu in one drawing from opening another
// drawing's docker. Commands still run through DrawingChrome's fresh guards.
export const DRAWING_UI_REQUEST = 'oms:drawing-ui-request';
const commands = ['undo', 'redo', 'duplicate', 'delete', 'group', 'ungroup', 'front', 'back',
  'forward', 'backward', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical',
  'lock', 'fit', 'fit-selection', 'select-all'] as const;
const panels = ['properties', 'objects', 'text', 'transform', 'align', 'repeat', 'radial', 'guides'] as const;
const cad = ['nodes', 'convert', 'outline', 'paint', 'outlineObject', 'document', 'importDxf', 'importVector'] as const;
const objects = ['relative', 'reverse'] as const;
export type DrawingImportEntry = { sequence: number; file: File; dropPoint?: CadPoint };
export type DrawingImportQueue = {
  entries: readonly DrawingImportEntry[];
  finish: (sequence: number, imported: boolean) => void;
};
export type QueuedImportControls = { skipLabel: string; finish: (imported: boolean) => void };

export type DrawingUiRequest =
  | { kind: 'command'; action: typeof commands[number] }
  | { kind: 'panel'; action: typeof panels[number] }
  | { kind: 'cad'; action: typeof cad[number]; file?: File; dropPoint?: CadPoint }
  | { kind: 'import'; action: 'reviewFiles'; files: File[]; dropPoint?: CadPoint }
  | { kind: 'objects'; action: typeof objects[number] };

export function isDrawingUiRequest(value: unknown): value is DrawingUiRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as { kind?: unknown; action?: unknown; file?: unknown; files?: unknown; dropPoint?: unknown };
  if (typeof request.action !== 'string') return false;
  if (request.kind === 'import') {
    const point = request.dropPoint as Partial<CadPoint> | undefined;
    return request.action === 'reviewFiles' && request.file === undefined && typeof File !== 'undefined' &&
      Array.isArray(request.files) && request.files.length > 0 &&
      request.files.every(file => file instanceof File && !!drawingFileKind(file)) &&
      (point === undefined || !!point && Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  if (request.files !== undefined) return false;
  if (request.file !== undefined &&
      (request.kind !== 'cad' || !['importDxf', 'importVector'].includes(request.action) ||
        typeof File === 'undefined' || !(request.file instanceof File))) return false;
  if (request.dropPoint !== undefined) {
    const point = request.dropPoint as Partial<CadPoint> | null;
    if (!request.file || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  }
  const actions: readonly string[] | undefined = request.kind === 'command' ? commands
    : request.kind === 'panel' ? panels : request.kind === 'cad' ? cad : request.kind === 'objects' ? objects : undefined;
  return !!actions?.includes(request.action);
}

export function requestDrawingUi(editor: Editor, request: DrawingUiRequest): void {
  editor.getContainer().dispatchEvent(new CustomEvent(DRAWING_UI_REQUEST, { detail: request }));
}

/** Returns the files that still need the canvas's normal attachment handling. */
export function routeCanvasCadImport(editor: Editor, files: File[], point?: CadPoint, picker = false): File[] {
  if (editor.getInstanceState().isReadonly) return [];
  const drawings: File[] = [], attachments: File[] = [];
  for (const file of files) {
    const kind = drawingFileKind(file);
    (kind && (kind !== 'pdf' || picker) ? drawings : attachments).push(file);
  }
  if (!drawings.length) return attachments;
  const dropPoint = point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: point.x, y: point.y } : undefined;
  requestDrawingUi(editor, { kind: 'import', action: 'reviewFiles', files: drawings, ...(dropPoint ? { dropPoint } : {}) });
  return attachments;
}
