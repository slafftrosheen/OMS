import { Box, PageRecordType, type Editor, type TLPageId } from '@tldraw/tldraw';
import { hasCanvasDraft } from './canvas-document';
import { CAD_MAX_COORDINATE, CAD_META_KEY, DEFAULT_CAD_SETTINGS, cadMmPerPixel, readCadSettings } from './cad-settings';
import { drawingTransaction } from './drawing-commands';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';

export type DrawingPageSize = { widthMm: number; heightMm: number };
const PAGE_SIZE_KEY = 'omsPageSize';
export const DRAWING_PAGE_NAME_LIMIT = 80;
export const DRAWING_PAGE_PRESETS = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  A2: { widthMm: 420, heightMm: 594 },
  A1: { widthMm: 594, heightMm: 841 },
  A0: { widthMm: 841, heightMm: 1189 }
};

function parsePageSize(value: unknown): DrawingPageSize | null {
  if (!value || typeof value !== 'object') return null;
  const { widthMm, heightMm } = value as DrawingPageSize;
  if (![widthMm, heightMm].every(n => Number.isFinite(n) && n >= 1 && n <= 100_000)) return null;
  return { widthMm, heightMm };
}

export function readDrawingPageSize(editor: Editor) {
  return parsePageSize(editor.getCurrentPage().meta[PAGE_SIZE_KEY]);
}

export function drawingPageBounds(editor: Editor): Box | null {
  const size = readDrawingPageSize(editor), settings = readCadSettings(editor);
  if (!size || !settings) return null;
  const factor = cadMmPerPixel(settings);
  const w = size.widthMm / factor, h = size.heightMm / factor;
  // Page geometry stays anchored at drawing (0, 0), independent of CAD datum.
  return w <= CAD_MAX_COORDINATE && h <= CAD_MAX_COORDINATE ? new Box(0, 0, w, h) : null;
}

function canNavigate(editor: Editor): boolean {
  return !editor.inputs.isPointing && !editor.inputs.isDragging && !editor.getEditingShapeId() &&
    !hasCanvasDraft(editor) && !isDrawingPointerGestureActive(editor);
}

export function switchDrawingPage(editor: Editor, id: TLPageId): boolean {
  if (id === editor.getCurrentPageId()) return true;
  if (!editor.getPage(id) || !canNavigate(editor)) return false;
  editor.run(() => editor.setCurrentPage(id), { history: 'ignore' });
  return editor.getCurrentPageId() === id;
}

export function fitDrawingPage(editor: Editor): boolean {
  const bounds = drawingPageBounds(editor);
  if (!bounds || !canNavigate(editor)) return false;
  editor.zoomToBounds(bounds);
  return true;
}

export function saveDrawingPage(editor: Editor, name: string, size: DrawingPageSize | null): boolean {
  if (editor.getInstanceState().isReadonly || !canNavigate(editor)) return false;
  const value = size === null ? null : parsePageSize(size);
  if (!name.trim() || name.trim().length > DRAWING_PAGE_NAME_LIMIT || size !== null && !value) return false;
  const page = editor.getCurrentPage(), settings = readCadSettings(editor) ?? DEFAULT_CAD_SETTINGS;
  const meta = { ...page.meta };
  if (value) {
    const factor = cadMmPerPixel(settings);
    if (Math.max(value.widthMm, value.heightMm) / factor > CAD_MAX_COORDINATE) return false;
    meta[CAD_META_KEY] = { ...settings };
    meta[PAGE_SIZE_KEY] = { ...value };
  } else delete meta[PAGE_SIZE_KEY];
  const updatedName = name.trim();
  if (updatedName === page.name && JSON.stringify(meta) === JSON.stringify(page.meta)) return true;
  return drawingTransaction(editor, () => editor.updatePage({ id: page.id, name: updatedName, meta }));
}

export function addDrawingPage(editor: Editor, name: string): boolean {
  const value = name.trim();
  if (editor.getInstanceState().isReadonly || editor.getPages().length >= editor.options.maxPages ||
      !value || value.length > DRAWING_PAGE_NAME_LIMIT || !canNavigate(editor)) return false;
  const size = readDrawingPageSize(editor) ?? DRAWING_PAGE_PRESETS.A4;
  const activeSettings = readCadSettings(editor) ?? DEFAULT_CAD_SETTINGS;
  const settings = Math.max(size.widthMm, size.heightMm) / cadMmPerPixel(activeSettings) <= CAD_MAX_COORDINATE
    ? activeSettings : DEFAULT_CAD_SETTINGS;
  const meta = {
    [CAD_META_KEY]: { ...settings, originX: 0, originY: 0 },
    [PAGE_SIZE_KEY]: { ...size }
  };
  const id = PageRecordType.createId();
  return drawingTransaction(editor, () => {
    editor.createPage({ id, name: value, meta });
    if (!editor.getPage(id)) throw new Error('page');
    editor.setCurrentPage(id);
  });
}
