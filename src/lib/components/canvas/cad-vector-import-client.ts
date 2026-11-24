import { base } from '$app/paths';
import { vectorPayloadKind, vectorUploadPayload } from './cad-vector-file';
import { drawingFileKind } from './drawing-file-types';

const conversionCodes = new Set([
  'format', 'page', 'font', 'conversion', 'cdr-conversion', 'converter-unavailable', 'cdr-converter-unavailable',
  'cancelled', 'busy', 'timeout', 'vector-input-limit', 'vector-output-limit',
]);

async function conversionFailure(response: Response, signal: AbortSignal) {
  if (response.status === 401 || response.status === 403) return 'vector-access';
  const payload = await response.json().catch(() => null);
  if (signal.aborted) return 'cancelled';
  const code = payload?.code;
  if (typeof code === 'string' && conversionCodes.has(code) && (code !== 'conversion' || response.status < 500)) return code;
  switch (response.status) {
    case 413: return 'vector-transport-limit';
    case 415: return 'format';
    case 429: return 'busy';
    case 408: case 504: return 'timeout';
    default: return response.status >= 500 || response.status === 404 ? 'vector-service' : 'conversion';
  }
}

export async function readVectorDrawingFile(
  file: File, pageNumber: number, outline: boolean, signal: AbortSignal,
) {
  const check = () => { if (signal.aborted) throw new Error('cancelled'); };
  check();
  const expected = drawingFileKind(file);
  if (expected === 'dxf') throw new Error('format');
  if (expected === 'svg') {
    const { readVectorSvg, SVG_IMPORT_LIMIT } = await import('./cad-svg-import');
    if (file.size > SVG_IMPORT_LIMIT) throw new Error('svg-input-limit');
    const bytes = new Uint8Array(await file.arrayBuffer());
    check();
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    let source: string;
    try { source = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
    catch { throw new Error('svg-format'); }
    return { ...readVectorSvg(source), sourcePage: 1, kind: 'svg' as const };
  }
  const { body, kind } = await vectorUploadPayload(file);
  check();
  if (expected && expected !== kind) throw new Error('format');
  const sourcePage = kind === 'eps' ? 1 : pageNumber;
  if (!Number.isInteger(sourcePage) || sourcePage < 1 || sourcePage > 5000) throw new Error('page');
  let selectedPage = sourcePage, bytes: ArrayBuffer;
  if (kind === 'eps' || kind === 'cdr' || outline) {
    let response: Response;
    try {
      response = await fetch(`${base}/api/canvas/convert-vector?page=${sourcePage}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body, signal,
      });
    } catch {
      check();
      throw new Error('vector-network');
    }
    check();
    if (!response.ok) throw new Error(await conversionFailure(response, signal));
    try { bytes = await response.arrayBuffer(); }
    catch {
      check();
      throw new Error('vector-network');
    }
    selectedPage = 1;
  } else {
    bytes = await body.arrayBuffer();
  }
  check();
  const data = new Uint8Array(bytes);
  if (vectorPayloadKind(data) !== 'pdf') throw new Error('vector-response');
  return { bytes: data, selectedPage, sourcePage, kind };
}
