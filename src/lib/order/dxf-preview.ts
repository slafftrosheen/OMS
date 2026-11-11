export const DXF_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export interface DxfPreviewData {
  paths: string[];
  viewBox: string;
  width: number;
  height: number;
  unit: string;
  omitted: { type: string; reason: string }[];
}
export function isDxfFile(name = '', mime = '') {
  return /\.dxf$/i.test(name) || /^(?:application|image)\/(?:x-)?dxf$/i.test(mime);
}

/** Bounded, same-origin reads; neither previews nor errors replace the original. */
export async function loadDxfPreview(source: File | string, signal: AbortSignal): Promise<DxfPreviewData> {
  signal.throwIfAborted();
  let text: string;
  if (typeof source !== 'string') {
    if (source.size > DXF_PREVIEW_MAX_BYTES) throw new Error('limit');
    text = await source.text();
  } else {
    const url = new URL(source, location.origin);
    if (url.origin !== location.origin ||
        !(url.protocol === 'blob:' || /^\/api\/files\/[a-zA-Z0-9_-]+(?:\/download)?$/.test(url.pathname)))
      throw new Error('source');
    const response = await fetch(url, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('source');
    if (Number(response.headers.get('Content-Length')) > DXF_PREVIEW_MAX_BYTES) throw new Error('limit');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('source');
    const decoder = new TextDecoder(); let size = 0; text = '';
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > DXF_PREVIEW_MAX_BYTES) { await reader.cancel(); throw new Error('limit'); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  signal.throwIfAborted();
  const [{ readCadDxf }, { DEFAULT_CAD_SETTINGS }, { curveBounds, curvePathData }] = await Promise.all([
    import('$lib/components/canvas/cad-import'), import('$lib/components/canvas/cad-settings'),
    import('$lib/components/canvas/cad-curves')
  ]);
  signal.throwIfAborted();
  const plan = readCadDxf(DEFAULT_CAD_SETTINGS, text, { keepCoordinates: true });
  if (!plan.contours.length) throw new Error('unsupported');
  const bounds = curveBounds(plan.contours), padding = Math.max(bounds.w, bounds.h, 1) * 0.04;
  return {
    paths: plan.contours.map(contour => curvePathData([contour])),
    viewBox: `${bounds.x - padding} ${bounds.y - padding} ${Math.max(bounds.w, padding) + 2 * padding} ${Math.max(bounds.h, padding) + 2 * padding}`,
    width: plan.widthMm, height: plan.heightMm, unit: plan.sourceUnit,
    omitted: plan.omitted
  };
}
