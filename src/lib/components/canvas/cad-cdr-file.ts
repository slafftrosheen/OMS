const text = new TextDecoder('latin1');
const endSignature = 0x06054b50, centralSignature = 0x02014b50, localSignature = 0x04034b50;
const maxExpandedBytes = 128 * 1024 * 1024;

export function isRiffCdr(bytes: Uint8Array, size = bytes.length): boolean {
  if (bytes.length < 12) return false;
  if (text.decode(bytes.subarray(0, 4)) !== 'RIFF' || !/^CDR[0-9A-Z ]$/i.test(text.decode(bytes.subarray(8, 12))))
    return false;
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  return length >= 4 && length + 8 <= size;
}

const directoryTailSize = 22 + 65_535;

function cdrDirectory(bytes: Uint8Array, size: number) {
  if (bytes.length < 22) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  const minimum = Math.max(0, end - 65_535);
  for (; end >= minimum; end--) {
    if (view.getUint32(end, true) === endSignature && end + 22 + view.getUint16(end + 20, true) === bytes.length)
      break;
  }
  if (end < minimum || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return null;
  const count = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  if (!count || count > 4096 || count !== view.getUint16(end + 8, true) ||
      start + directorySize !== size - bytes.length + end) return null;
  return { start, end: start + directorySize, count };
}

type CdrEntry = { name: string; nameLength: number; local: number; method: number; flags: number; length: number; compressed: number };

function checkDirectory(
  directory: Uint8Array, count: number, start: number, checkEntry?: (entry: CdrEntry) => boolean,
): boolean {
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const end = directory.length;
  let offset = 0, expanded = 0, found = false;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== centralSignature) return false;
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true), length = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true);
    const comment = view.getUint16(offset + 32, true), local = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extra + comment;
    expanded += length;
    if (!nameLength || next > end || expanded > maxExpandedBytes || flags & 1 ||
        (method !== 0 && method !== 8) || view.getUint16(offset + 34, true) || local + 30 + nameLength + compressed > start) return false;
    const name = text.decode(directory.subarray(offset + 46, offset + 46 + nameLength));
    if (name.startsWith('/') || /[\\:\u0000]/.test(name) || name.split('/').includes('..') || names.has(name)) return false;
    if (checkEntry && !checkEntry({ name, nameLength, local, method, flags, length, compressed })) return false;
    names.add(name);
    if (/^content\/(?:riffData\.cdr|root\.dat)$/i.test(name) && length >= 12) found = true;
    offset = next;
  }
  return offset === end && found;
}

/** Browser preflight reads only the ZIP directory. Local headers and the
 * bounded inflated sizes are verified again on the server before conversion. */
export async function probeCdrArchive(file: Blob): Promise<boolean> {
  const tailStart = Math.max(0, file.size - directoryTailSize);
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
  const archive = cdrDirectory(tail, file.size);
  if (!archive) return false;
  const { start, end, count } = archive;
  const directory = start >= tailStart ? tail.subarray(start - tailStart, end - tailStart)
    : new Uint8Array(await file.slice(start, end).arrayBuffer());
  return checkDirectory(directory, count, start);
}

/** Check the directory and every local entry before a native decoder inflates the package. */
export function isCdrArchive(
  bytes: Uint8Array,
  verifyEntry?: (data: Uint8Array, size: number, method: number) => boolean,
): boolean {
  if (bytes.length < 22) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== localSignature) return false;
  const archive = cdrDirectory(bytes, bytes.length);
  if (!archive) return false;
  const { start, end, count } = archive;
  return checkDirectory(bytes.subarray(start, end), count, start, entry => {
    const { name, nameLength, local, method, flags, length, compressed } = entry;
    if (view.getUint32(local, true) !== localSignature || view.getUint16(local + 26, true) !== nameLength ||
        view.getUint16(local + 8, true) !== method || view.getUint16(local + 6, true) !== flags) return false;
    const nameStart = local + 30;
    const dataStart = nameStart + nameLength + view.getUint16(local + 28, true);
    if (dataStart + compressed > start || name !== text.decode(bytes.subarray(nameStart, nameStart + nameLength))) return false;
    return !verifyEntry || verifyEntry(bytes.subarray(dataStart, dataStart + compressed), length, method);
  });
}
