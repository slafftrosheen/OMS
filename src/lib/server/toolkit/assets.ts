import { error } from '@sveltejs/kit';

export const TOOLKIT_ASSET_BUCKET = 'toolkit-assets';
export const MAX_TOOLKIT_ASSET_BYTES = 25 * 1024 * 1024;
export const TOOLKIT_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'
]);

export function validatedToolkitFile(file: File): { mime: string; name: string } {
  if (!(file instanceof File)) throw error(400, 'A file is required');
  const mime = file.type.toLowerCase();
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
