import { DefaultFontStyle, type Editor, type TLShape, type TLShapeId, type TLTextShape } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';

export const MAX_DRAWING_FONT_BYTES = 1024 * 1024;
export const MAX_DRAWING_FONTS_BYTES = 1024 * 1024;
export const MAX_DRAWING_FONTS = 16;
export interface DrawingFont { id: string; name: string; family: string; subfamily: string; data: string; bytes: number }
const builtin = new Set(['draw', 'sans', 'serif', 'mono']);
const loaded = new Map<string, { font: any; face?: FontFace; data: string }>();
const loading = new Map<string, Promise<void>>();
const fail = (code: string): never => { throw new Error(code); };
export const drawingFontFamily = (font: DrawingFont) => `OMS_${font.id.slice(8)}`;
export const getShapeDrawingFontId = (shape: TLShape): string | null => typeof shape.meta.omsFontId === 'string' && shape.meta.omsFontId ? shape.meta.omsFontId : null;
export const drawingFontValue = (shape: TLTextShape): string => getShapeDrawingFontId(shape) ?? shape.props.font;
export function validDrawingFont(value: unknown): value is DrawingFont {
  if (!value || typeof value !== 'object') return false;
  const f = value as DrawingFont;
  return /^omsfont-[a-f0-9]{64}$/.test(f.id) && ['name', 'family', 'subfamily'].every(k => typeof f[k] === 'string' && f[k].length <= 128) &&
    Number.isInteger(f.bytes) && f.bytes > 0 && f.bytes <= MAX_DRAWING_FONT_BYTES && typeof f.data === 'string' &&
    f.data.length === Math.ceil(f.bytes / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(f.data);
}
function records(meta: any): DrawingFont[] {
  const list = meta?.omsFonts;
  if (!Array.isArray(list) || list.length > MAX_DRAWING_FONTS || !list.every(validDrawingFont)) return [];
  if (new Set(list.map(f => f.id)).size !== list.length || list.reduce((n, f) => n + f.bytes, 0) > MAX_DRAWING_FONTS_BYTES) return [];
  return list;
}
export const readDrawingFonts = (editor: Editor): DrawingFont[] => records(editor.getDocumentSettings().meta);
export function drawingFontBytes(font: DrawingFont): ArrayBuffer {
  if (!validDrawingFont(font)) return fail('font-invalid');
  const binary = atob(font.data), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (bytes.length !== font.bytes) return fail('font-invalid');
  return bytes.buffer;
}
async function hash(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) return 'omsfont-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  // OMS also runs over HTTP on private LAN/Tailscale addresses, where browsers
  // omit SubtleCrypto. Keep the same content identity without a secure-context requirement.
  const [{ default: sha256 }, { default: latin1 }] = await Promise.all([import('crypto-js/sha256.js'), import('crypto-js/enc-latin1.js')]);
  let binary = ''; const values = new Uint8Array(bytes);
  for (let i = 0; i < values.length; i += 8192) binary += String.fromCharCode(...values.subarray(i, i + 8192));
  return 'omsfont-' + sha256(latin1.parse(binary)).toString();
}
export async function parseDrawingFont(bytes: ArrayBuffer): Promise<any> {
  if (!bytes.byteLength || bytes.byteLength > MAX_DRAWING_FONT_BYTES) return fail('font-too-large');
  const view = new Uint8Array(bytes), signature = String.fromCharCode(...view.slice(0, 4));
  if (!(view[0] === 0 && view[1] === 1 && view[2] === 0 && view[3] === 0) && !['OTTO', 'true', 'wOFF', 'wOF2'].includes(signature)) return fail('font-invalid');
  try {
    const { create } = await import('fontkit');
    const font = create(view);
    if (typeof font.layout !== 'function' || !Number.isFinite(font.unitsPerEm) || font.unitsPerEm <= 0 || !Number.isFinite(font.ascent) || !Number.isFinite(font.descent)) return fail('font-invalid');
    const fsType = font['OS/2']?.fsType;
    // fontkit versions expose either the bit field or decoded flags.
    if (typeof fsType === 'number' ? !!(fsType & (2 | 512)) || !!(fsType & 4) && !(fsType & 8) : fsType?.noEmbedding || fsType?.bitmapOnly || fsType?.viewOnly && !fsType?.editable) return fail('font-embedding');
    const glyph = font.glyphForCodePoint(65);
    if (!glyph || !Array.isArray(glyph.path.commands)) return fail('font-invalid');
    return font;
  } catch (e) { if (e instanceof Error && e.message === 'font-embedding') throw e; return fail('font-invalid'); }
}
const safeName = (s: unknown, fallback: string) => typeof s === 'string' && s.trim() ? [...s].filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').trim().slice(0, 128) : fallback;
export async function prepareDrawingFont(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>): Promise<DrawingFont> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) return fail('font-invalid');
  if (!file.size || file.size > MAX_DRAWING_FONT_BYTES) return fail('font-too-large');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) return fail('font-invalid');
  const font = await parseDrawingFont(bytes), id = await hash(bytes);
  let binary = ''; const values = new Uint8Array(bytes);
  for (let i = 0; i < values.length; i += 8192) binary += String.fromCharCode(...values.subarray(i, i + 8192));
  return { id, name: safeName(font.fullName, file.name), family: safeName(font.familyName, file.name), subfamily: safeName(font.subfamilyName, 'Regular'), data: btoa(binary), bytes: bytes.byteLength };
}
export async function loadDrawingFont(font: DrawingFont): Promise<void> {
  if (!validDrawingFont(font)) return fail('font-invalid');
  // Always verify the payload, even if this id was previously loaded in another drawing.
  const bytes = drawingFontBytes(font);
  if (await hash(bytes) !== font.id) return fail('font-invalid');
  if (loaded.has(font.id)) return;
  if (loading.has(font.id)) return loading.get(font.id)!;
  const work = (async () => {
    const parsed = await parseDrawingFont(bytes);
    let face: FontFace | undefined;
    if (typeof FontFace !== 'undefined') {
      face = new FontFace(drawingFontFamily(font), bytes);
      try { await face.load(); document.fonts.add(face); } catch { return fail('font-invalid'); }
    }
    loaded.set(font.id, { font: parsed, face, data: font.data });
  })();
  loading.set(font.id, work);
  try { await work; } finally { loading.delete(font.id); }
}
export function getLoadedDrawingFont(editor: Editor, id: string): { record: DrawingFont; font: any } | undefined {
  const record = readDrawingFonts(editor).find(f => f.id === id), item = loaded.get(id);
  return record && item && record.data === item.data ? { record, font: item.font } : undefined;
}
export async function preloadSnapshotDrawingFonts(snapshot: any): Promise<void> {
  const store = snapshot?.document?.store ?? snapshot?.store;
  if (!store || typeof store !== 'object') return;
  const doc: any = Object.values(store).find((r: any) => r?.typeName === 'document');
  // A damaged/unloadable face remains explicit on its shapes; never silently export fallback lettering.
  await Promise.allSettled(records(doc?.meta).map(loadDrawingFont));
}
export async function uploadDrawingFont(editor: Editor, file: File): Promise<DrawingFont> {
  if (editor.getInstanceState().isReadonly) return fail('font-readonly');
  const font = await prepareDrawingFont(file);
  const wasReady = getLoadedDrawingFont(editor, font.id);
  await loadDrawingFont(font);
  if (editor.getInstanceState().isReadonly || editor.isDisposed) return fail('font-readonly');
  const current = readDrawingFonts(editor), existing = current.find(f => f.id === font.id);
  if (existing && existing.data === font.data && wasReady) return existing;
  if (!existing && current.length >= MAX_DRAWING_FONTS || current.reduce((n, f) => n + f.bytes, 0) - (existing?.bytes ?? 0) + font.bytes > MAX_DRAWING_FONTS_BYTES) return fail('font-limit');
  const payloadBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (payloadBytes(editor.store.getStoreSnapshot()) + payloadBytes(font) - (existing ? payloadBytes(existing) : 0) + 64 > 1_900_000) return fail('font-save-limit');
  if (!drawingTransaction(editor, () => editor.updateDocumentSettings({ meta: { ...editor.getDocumentSettings().meta, omsFonts: [...current.filter(f => f.id !== font.id), font] as any, omsFontsRevision: Number(editor.getDocumentSettings().meta.omsFontsRevision ?? 0) + 1 } }))) return fail('font-invalid');
  return font;
}
export function drawingFontInUse(editor: Editor, id: string): boolean {
  return editor.store.allRecords().some(r => r.typeName === 'shape' && getShapeDrawingFontId(r) === id) || getNextDrawingFont(editor) === id;
}
export function removeDrawingFont(editor: Editor, id: string): boolean {
  if (editor.getInstanceState().isReadonly || drawingFontInUse(editor, id)) return false;
  return drawingTransaction(editor, () => editor.updateDocumentSettings({ meta: { ...editor.getDocumentSettings().meta, omsFonts: readDrawingFonts(editor).filter(f => f.id !== id) as any } }));
}
export function fontSupportsText(font: any, text: string): boolean {
  return [...text.normalize('NFC')].every(c => /\s/u.test(c) || font.hasGlyphForCodePoint(c.codePointAt(0)));
}
export function drawingFontPatch(editor: Editor, shape: TLTextShape, value: string) {
  if (builtin.has(value)) return { props: { font: value as TLTextShape['props']['font'] }, meta: { ...shape.meta, omsFontId: null } };
  const found = getLoadedDrawingFont(editor, value);
  if (!found) return fail('font-missing');
  if (!fontSupportsText(found.font, shape.props.text)) return fail('font-glyphs');
  return { props: { font: 'sans' as const }, meta: { ...shape.meta, omsFontId: value } };
}
export function applySelectedDrawingFont(editor: Editor, expectedIds: readonly TLShapeId[], value: string): boolean {
  const ids = editor.getSelectedShapeIds();
  if (editor.getInstanceState().isReadonly || editor.getCurrentToolId() !== 'select' || !ids.length || new Set(expectedIds).size !== expectedIds.length || ids.length !== expectedIds.length || ids.some(id => !expectedIds.includes(id))) return false;
  try {
    const updates = ids.map(id => {
      const shape = editor.getShape<TLTextShape>(id);
      if (!shape || shape.type !== 'text' || editor.isShapeOrAncestorLocked(shape)) return fail('font-readonly');
      return { id, type: 'text' as const, ...drawingFontPatch(editor, shape, value) };
    });
    return drawingTransaction(editor, () => {
      editor.updateShapes(updates);
      if (ids.some(id => drawingFontValue(editor.getShape<TLTextShape>(id)!) !== value)) return fail('font-invalid');
    });
  } catch { return false; }
}
export function getNextDrawingFont(editor: Editor): string {
  const id = editor.getInstanceState().meta?.omsNextFont;
  return typeof id === 'string' && id ? id : editor.getStyleForNextShape(DefaultFontStyle);
}
export function setNextDrawingFont(editor: Editor, value: string): boolean {
  if (editor.getInstanceState().isReadonly || !builtin.has(value) && !getLoadedDrawingFont(editor, value)) return false;
  editor.setStyleForNextShapes(DefaultFontStyle, builtin.has(value) ? value as TLTextShape['props']['font'] : 'sans');
  editor.updateInstanceState({ meta: { ...editor.getInstanceState().meta, omsNextFont: builtin.has(value) ? null : value } });
  return true;
}
export function installDrawingFonts(editor: Editor): () => void {
  return editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
    if (shape.type !== 'text' || editor.getCurrentToolId() !== 'text' || getShapeDrawingFontId(shape)) return shape;
    const next = getNextDrawingFont(editor);
    if (!builtin.has(next) && getLoadedDrawingFont(editor, next)) return { ...shape, meta: { ...shape.meta, omsFontId: next } };
    return shape;
  });
}
/** Called inside the native style transaction, including groups. */
export function clearSelectedDrawingFontOverrides(editor: Editor): void {
  const ids = editor.getShapeAndDescendantIds(editor.getSelectedShapeIds());
  const updates = [...ids].flatMap(id => {
    const shape = editor.getShape(id);
    return shape?.type === 'text' && getShapeDrawingFontId(shape) && !editor.isShapeOrAncestorLocked(shape)
      ? [{ id, type: 'text' as const, meta: { ...shape.meta, omsFontId: null } }] : [];
  });
  editor.updateShapes(updates);
}
