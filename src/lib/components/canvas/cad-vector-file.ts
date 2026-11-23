import { isCdrArchive, isRiffCdr, probeCdrArchive } from './cad-cdr-file';

export const VECTOR_PDF_INPUT_LIMIT = 12 * 1024 * 1024;
// Stay below the existing adapter-node and reverse proxy limits of 32 MiB.
export const VECTOR_CONVERSION_LIMIT = 30 * 1024 * 1024;
const EPS_HEADER_SIZE = 30;
const FORMAT_PROBE_SIZE = 32;

/** Locate the PostScript payload without reading a DOS EPS preview. */
export function dosEpsSection(header: Uint8Array, fileSize = header.byteLength) {
  if (header[0] !== 0xc5 || header[1] !== 0xd0 || header[2] !== 0xd3 || header[3] !== 0xc6) return null;
  if (header.byteLength < EPS_HEADER_SIZE) throw new Error('format');
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const start = view.getUint32(4, true);
  const size = view.getUint32(8, true);
  if (start < EPS_HEADER_SIZE || size < 16 || start + size > fileSize) throw new Error('format');
  return { start, end: start + size };
}

export function vectorPayloadKind(header: Uint8Array, size = header.length): 'pdf' | 'eps' | 'cdr' | null {
  const magic = new TextDecoder('latin1').decode(header.subarray(0, FORMAT_PROBE_SIZE));
  if (magic.startsWith('%PDF-')) return 'pdf';
  if (magic.startsWith('%!PS-Adobe-') && magic.includes('EPSF-')) return 'eps';
  if (isRiffCdr(header, size) || isCdrArchive(header)) return 'cdr';
  return null;
}

export async function vectorUploadPayload(file: Blob) {
  const probe = async (source: Blob) => new Uint8Array(await source.slice(0, FORMAT_PROBE_SIZE).arrayBuffer());
  const header = await probe(file);
  const section = dosEpsSection(header, file.size);
  const body = section ? file.slice(section.start, section.end) : file;
  if (body.size < 8) throw new Error('format');
  if (body.size > VECTOR_CONVERSION_LIMIT) throw new Error('vector-input-limit');
  const signature = section ? await probe(body) : header;
  const kind = vectorPayloadKind(signature, body.size) ??
    (!section && signature[0] === 0x50 && signature[1] === 0x4b &&
      signature[2] === 3 && signature[3] === 4 && await probeCdrArchive(body) ? 'cdr' : null);
  if (!kind || (section && kind !== 'eps')) throw new Error('format');
  if (kind === 'pdf' && body.size > VECTOR_PDF_INPUT_LIMIT) throw new Error('vector-input-limit');
  return { body, kind };
}

