import { error } from '@sveltejs/kit';
import { MAX_CANVAS_SNAPSHOT_BYTES, MAX_CANVAS_SNAPSHOT_EDGE, type CanvasDrawingSnapshot } from '$lib/components/canvas/toolkit-snapshot';
import type { ToolkitScene } from '$lib/components/canvas/toolkit-scene';

/** Browser-generated pixels are user input. Validate PNG signature and IHDR
 * dimensions as well as encoded size before including them in a provider call. */
export function normalizeDrawingSnapshot(input: unknown, scene: ToolkitScene): CanvasDrawingSnapshot | null {
  if (input === undefined || input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error(400, 'Invalid drawing snapshot');
  const raw = input as Record<string, any>;
  if (typeof raw.dataUrl !== 'string' || raw.dataUrl.length > 32 + Math.ceil(MAX_CANVAS_SNAPSHOT_BYTES / 3) * 4 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.dataUrl)) throw error(400, 'Drawing snapshot must be a bounded PNG');
  const bytes = Buffer.from(raw.dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.byteLength < 33 || bytes.byteLength > MAX_CANVAS_SNAPSHOT_BYTES ||
      ![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw error(400, 'Invalid drawing PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > MAX_CANVAS_SNAPSHOT_EDGE || height > MAX_CANVAS_SNAPSHOT_EDGE ||
      raw.width !== width || raw.height !== height) throw error(400, 'Drawing snapshot dimensions exceed the limit');
  const ids = new Set(scene.shapes.map(shape => shape.id));
  if (!Array.isArray(raw.shapeIds) || !raw.shapeIds.length || raw.shapeIds.length > 200 ||
      raw.shapeIds.some((id: unknown) => typeof id !== 'string' || !ids.has(id)) ||
      !['selection','page'].includes(raw.scope) || !Number.isSafeInteger(raw.omitted) || raw.omitted < 0 || raw.omitted > 100_000) throw error(400, 'Drawing snapshot context is invalid');
  return { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, width, height,
    shapeIds: [...new Set<string>(raw.shapeIds)], scope: raw.scope, omitted: raw.omitted };
}

/** Bound the complete request while streaming; a 32 MB upload setting must not
 * also allow 32 MB assistant prompts to be allocated and parsed. */
export async function readToolkitAssistantRequest(request: Request): Promise<any> {
  const limit = 2 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw error(413, 'Canvas assistant request is too large');
  const reader = request.body?.getReader();
  if (!reader) throw error(400, 'Canvas assistant request is empty');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw error(413, 'Canvas assistant request is too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw error(400, 'Invalid Canvas assistant request'); }
}
