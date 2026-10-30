/** Export the actual native drawing layer locally. HTML/media nodes remain in
 * structured context; private project images are authorized separately server-side. */
export const MAX_CANVAS_SNAPSHOT_BYTES = 800 * 1024;
export const MAX_CANVAS_SNAPSHOT_EDGE = 1600;
const DRAWING_TYPES = new Set(['geo','text','note','arrow','line','draw','highlight']);
export type CanvasDrawingSnapshot = {
  dataUrl: string; width: number; height: number; shapeIds: string[];
  scope: 'selection' | 'page'; omitted: number;
};

export async function captureCanvasDrawing(editor: any, includedShapeIds?: string[]): Promise<CanvasDrawingSnapshot | null> {
  if (!editor || typeof editor.getSvgString !== 'function') return null;
  const all: any[] = editor.getCurrentPageShapes?.() ?? [];
  const selected: string[] = editor.getSelectedShapeIds?.() ?? [];
  const selectedIds = selected.length
    ? editor.getShapeAndDescendantIds?.(selected) ?? new Set(selected) : null;
  const scope = selectedIds ? 'selection' : 'page';
  const relevant = selectedIds ? all.filter(shape => selectedIds.has(shape.id)) : all;
  const allowed = includedShapeIds ? new Set(includedShapeIds) : null;
  const shapes = relevant.filter(shape => DRAWING_TYPES.has(shape.type) && (!allowed || allowed.has(shape.id))).slice(0, 200);
  if (!shapes.length) return null;
  let timeout: ReturnType<typeof setTimeout>;
  const snapshot = await Promise.race([
    editor.getSvgString(shapes, { background: true, darkMode: false, padding: 24 }),
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Canvas drawing export timed out')), 8000); })
  ]).finally(() => clearTimeout(timeout));
  if (!snapshot?.svg || !Number.isFinite(snapshot.width) || !Number.isFinite(snapshot.height) || snapshot.width <= 0 || snapshot.height <= 0) return null;
  const scale = Math.min(1, MAX_CANVAS_SNAPSHOT_EDGE / snapshot.width, MAX_CANVAS_SNAPSHOT_EDGE / snapshot.height);
  const width = Math.max(1, Math.round(snapshot.width * scale));
  const height = Math.max(1, Math.round(snapshot.height * scale));
  const document = new DOMParser().parseFromString(snapshot.svg, 'image/svg+xml');
  const svg = document.documentElement;
  if (document.querySelector('parsererror') || svg.tagName !== 'svg') return null;
  // Native SVG exports should contain no external media, frames or scripts.
  // Fail rather than capture arbitrary HTML or a canvas tainted by remote URLs.
  if (document.querySelector('foreignObject,image,script,iframe')) return null;
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const bitmap = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Canvas image export timed out')), 8000);
      bitmap.onload = () => { clearTimeout(timer); resolve(); };
      bitmap.onerror = () => { clearTimeout(timer); reject(new Error('Canvas image export unavailable')); };
      bitmap.src = url;
    });
    const canvas = window.document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > 32 + Math.ceil(MAX_CANVAS_SNAPSHOT_BYTES / 3) * 4) return null;
    return { dataUrl, width, height, shapeIds: shapes.map(shape => shape.id), scope,
      omitted: relevant.length - shapes.length };
  } finally { URL.revokeObjectURL(url); }
}
