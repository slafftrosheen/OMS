import { validRasterReference, type VectorRaster } from './cad-appearance';
import { drawingPngSize } from './drawing-operations';

// Bound both the private attachment and its aggregate export allocation.
export const DRAWING_EXPORT_ASSET_BYTES = 25 * 1024 * 1024;
export const DRAWING_EXPORT_TOTAL_ASSET_BYTES = 64 * 1024 * 1024;
export const DRAWING_EXPORT_TOTAL_ASSET_PIXELS = 64 * 1024 * 1024;

export async function readOriginalDrawingRaster(raster: VectorRaster, signal: AbortSignal, remaining: number, check: () => void) {
  if (!validRasterReference(raster.png, raster.fileId)) throw new Error('asset-fetch');
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  let response: Response;
  try { response = await fetch(raster.png, { credentials: 'same-origin', redirect: 'error', signal: requestSignal }); }
  catch { check(); throw new Error('asset-fetch'); }
  try { check(); } catch (error) { await response.body?.cancel().catch(() => {}); throw error; }
  const limit = Math.min(DRAWING_EXPORT_ASSET_BYTES, remaining);
  if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/png' || !response.body) {
    await response.body?.cancel().catch(() => {}); throw new Error('asset-fetch');
  }
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body.cancel().catch(() => {}); throw new Error('limit');
  }
  const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('cancelled');
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new Error('limit');
      chunks.push(new Uint8Array(chunk.value).buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => {}); check();
    throw error instanceof Error && error.message === 'limit' ? error : new Error('asset-fetch');
  } finally { reader.releaseLock(); }
  check();
  const blob = new Blob(chunks, { type: 'image/png' });
  try {
    const size = await drawingPngSize(blob);
    if (size.width !== raster.width || size.height !== raster.height) throw new Error('asset-fetch');
  } catch { check(); throw new Error('asset-fetch'); }
  check();
  return { blob, bytes };
}

/** Decode the original before reporting a successful export. */
export async function decodeOriginalDrawingRaster(blob: Blob, raster: VectorRaster, check: () => void) {
  const bitmap = await createImageBitmap(blob).catch(() => {
    check(); throw new Error('asset-fetch');
  });
  try {
    check();
    if (bitmap.width !== raster.width || bitmap.height !== raster.height) throw new Error('asset-fetch');
    return bitmap;
  } catch (error) {
    bitmap.close();
    throw error;
  }
}
