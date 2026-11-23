import { base } from '$app/paths';
import { vectorPayloadKind, vectorUploadPayload } from './cad-vector-file';
import { drawingFileKind } from './drawing-file-types';

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
    const response = await fetch(`${base}/api/canvas/convert-vector?page=${sourcePage}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body, signal,
    });
    check();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('vector-access');
      const error = await response.json().catch(() => ({}));
      throw new Error(error.code ?? (response.status === 413 ? 'vector-transport-limit' : 'conversion'));
    }
    bytes = await response.arrayBuffer();
    selectedPage = 1;
  } else {
    bytes = await body.arrayBuffer();
  }
  check();
  const data = new Uint8Array(bytes);
  if (vectorPayloadKind(data) !== 'pdf') throw new Error('conversion');
  return { bytes: data, selectedPage, sourcePage, kind };
}
