import { atom, type Editor } from '@tldraw/tldraw';

export type DrawingPenMode = 'auto' | 'pen-only';
export type DrawingPenResponse = 'soft' | 'linear' | 'firm';
export type DrawingPenBarrelAction = 'context' | 'pan' | 'eraser';
export interface DrawingPenSettings {
  mode: DrawingPenMode;
  pressure: boolean;
  response: DrawingPenResponse;
  barrelAction: DrawingPenBarrelAction;
}
export const DEFAULT_DRAWING_PEN_SETTINGS: Readonly<DrawingPenSettings> = Object.freeze({
  mode: 'auto', pressure: true, response: 'linear', barrelAction: 'context',
});
const STORAGE_KEY = 'oms.drawing.pen.v1';
const settings = new WeakMap<Editor, ReturnType<typeof atom<DrawingPenSettings>>>();
const persistence = new WeakMap<Editor, ReturnType<typeof atom<boolean>>>();
function storageState(editor: Editor) {
  let value = persistence.get(editor);
  if (!value) { value = atom('Drawing pen preferences saved locally', true); persistence.set(editor, value); }
  return value;
}

export function validateDrawingPenSettings(value: unknown): value is DrawingPenSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as DrawingPenSettings;
  return Object.keys(v).length === 4 && ['auto', 'pen-only'].includes(v.mode) &&
    typeof v.pressure === 'boolean' && ['soft', 'linear', 'firm'].includes(v.response) &&
    ['context', 'pan', 'eraser'].includes(v.barrelAction);
}

/** Tablet preferences belong to this browser, not to saved/shared artwork. */
export function drawingPenSettings(editor: Editor) {
  let value = settings.get(editor);
  if (!value) {
    let initial = { ...DEFAULT_DRAWING_PEN_SETTINGS };
    let stored: string | null | undefined;
    try { stored = editor.getContainer().ownerDocument.defaultView?.localStorage.getItem(STORAGE_KEY); }
    catch { storageState(editor).set(false); }
    if (stored) {
      try { const parsed: unknown = JSON.parse(stored); if (validateDrawingPenSettings(parsed)) initial = { ...parsed }; }
      catch { /* An invalid saved preference falls back without being overwritten. */ }
    }
    value = atom<DrawingPenSettings>('Drawing pen preferences', initial); settings.set(editor, value);
  }
  return value;
}
export const readDrawingPenSettings = (editor: Editor): DrawingPenSettings => ({ ...drawingPenSettings(editor).get() });
export function updateDrawingPenSettings(editor: Editor, update: Partial<DrawingPenSettings>): boolean {
  const next = { ...drawingPenSettings(editor).get(), ...update };
  if (!validateDrawingPenSettings(next)) return false;
  drawingPenSettings(editor).set(next);
  if (update.mode) editor.updateInstanceState({ isPenMode: next.mode === 'pen-only' });
  try {
    const storage = editor.getContainer().ownerDocument.defaultView?.localStorage;
    if (!storage) throw new Error('Browser storage is unavailable');
    storage.setItem(STORAGE_KEY, JSON.stringify(next)); storageState(editor).set(true);
  } catch { storageState(editor).set(false); }
  return true;
}
export const resetDrawingPenSettings = (editor: Editor) => updateDrawingPenSettings(editor, { ...DEFAULT_DRAWING_PEN_SETTINGS });
export function drawingPenStorageStatus(editor: Editor) { drawingPenSettings(editor); return storageState(editor); }
export function drawingPenSettingsPersisted(editor: Editor): boolean { return drawingPenStorageStatus(editor).get(); }

/** Pressure remains a normalized input value. Native ink applies its own
 * rendering response; the CAD freehand nib uses 1 as its configured width. */
export function mapDrawingPenPressure(raw: number, value: DrawingPenSettings, tool = 'draw'): number {
  if (!value.pressure) return tool === 'cad-freehand' ? 1 : .5;
  const pressure = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : .5;
  return value.response === 'soft' ? Math.sqrt(pressure) : value.response === 'firm' ? pressure * pressure : pressure;
}
