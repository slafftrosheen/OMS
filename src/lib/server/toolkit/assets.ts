import { error } from '@sveltejs/kit';
import { TOOLKIT_MEDIA_MAX_BYTES, TOOLKIT_MEDIA_MIMES, toolkitFileMime } from '$lib/components/canvas/toolkit-media-types';

export const TOOLKIT_ASSET_BUCKET = 'toolkit-assets';
export const MAX_TOOLKIT_ASSET_BYTES = TOOLKIT_MEDIA_MAX_BYTES;
export const TOOLKIT_MIMES = TOOLKIT_MEDIA_MIMES;

export function validatedToolkitFile(file: File): { mime: string; name: string } {
  if (!(file instanceof File)) throw error(400, 'A file is required');
  // Some Windows/browser File objects arrive with no MIME type.
  // Resolve only known extensions, then verify the actual magic bytes below.
  const mime = toolkitFileMime(file);
  if (!TOOLKIT_MIMES.has(mime)) throw error(415, 'Supported formats: PNG, JPG, WebP, GIF, PDF, MP4, WebM, MP3, WAV, Ogg and M4A');
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
  if (mime === 'video/mp4' || mime === 'audio/mp4') return header.length >= 12 && ascii(4, 4) === 'ftyp' &&
    ['isom','iso2','iso5','iso6','mp41','mp42','M4V ','M4A ','avc1','dash'].includes(ascii(8, 4));
  if (mime === 'video/webm') return header.length >= 4 && [0x1a,0x45,0xdf,0xa3].every((value, index) => header[index] === value);
  if (mime === 'audio/mpeg') return ascii(0, 3) === 'ID3' ||
    (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
  if (mime === 'audio/wav') return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
  if (mime === 'audio/ogg') return ascii(0, 4) === 'OggS';
  return false;
}

/** One RFC7233 byte range, sufficient for media seeking and PDF previews. */
export function toolkitByteRange(value: string | null, size: number): { start: number; end: number } | null | false {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
    (!match[1] && Number(match[2]) === 0) || start < 0 || start >= size || end < start) return false;
  return { start, end };
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
