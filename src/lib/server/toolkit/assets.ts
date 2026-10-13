import { error } from '@sveltejs/kit';

export const TOOLKIT_ASSET_BUCKET = 'toolkit-assets';
export const MAX_TOOLKIT_ASSET_BYTES = 25 * 1024 * 1024;
export const TOOLKIT_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'
]);

export function validatedToolkitFile(file: File): { mime: string; name: string } {
  if (!(file instanceof File)) throw error(400, 'A file is required');
  // Some Windows/browser File objects arrive with no MIME type.
  // Resolve only known extensions, then verify the actual magic bytes below.
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const byExtension: Record<string,string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf'
  };
  const declaredMime = file.type.toLowerCase();
  const mime = !declaredMime || declaredMime === 'application/octet-stream'
    ? byExtension[extension] || '' : declaredMime;
  if (!TOOLKIT_MIMES.has(mime)) throw error(415, 'Supported formats: PNG, JPG, WebP, GIF and PDF');
  if (file.size < 1 || file.size > MAX_TOOLKIT_ASSET_BYTES) throw error(413, 'File must be 1 byte to 25 MB');
  const name = file.name.replace(/[\\/\r\n\0<>]/g, '_').slice(0, 180).trim();
  if (!name) throw error(400, 'File name required');
  return { mime, name };
}
export function signatureMatches(mime: string, header: Uint8Array): boolean {
  const ascii = (offset: number, count: number) => String.fromCharCode(...header.slice(offset, offset + count));
  if (mime === 'application/pdf') return ascii(0, 5) === '%PDF-';
  if (mime === 'image/png') return header.length >= 8 && [137,80,78,71,13,10,26,10].every((x,i) => header[i] === x);
  if (mime === 'image/jpeg') return header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255;
  if (mime === 'image/gif') return ['GIF87a','GIF89a'].includes(ascii(0, 6));
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
  return false;
}
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** SvelteKit adapter-node enforces BODY_SIZE_LIMIT before route handlers run.
 * Its default is 512K. The old BODY_LIMIT variable is not recognized.
 * Read-only diagnostic: do not silently increase process-wide limits. */
export function toolkitUploadLimitBytes(setting: string | undefined): number {
  if (!setting) return 512 * 1024;
  const value = setting.trim();
  if (/^infinity$/i.test(value)) return Infinity;
  const match = /^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/i.exec(value);
  if (!match) return 0;
  const scale = { '': 1, k: 1024, m: 1048576, g: 1073741824 };
  return Math.floor(Number(match[1]) * scale[match[2].toLowerCase() as keyof typeof scale]);
}
export function toolkitUploadReadiness(setting: string | undefined) {
  const bytes = toolkitUploadLimitBytes(setting);
  // multipart headers and encoding require space beyond the maximum file size
  return { ready: bytes >= MAX_TOOLKIT_ASSET_BYTES + 1024 * 1024,
    configuredLimitBytes: Number.isFinite(bytes) ? bytes : null,
    expectedSetting: 'BODY_SIZE_LIMIT=32M' };
}
