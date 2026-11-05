import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

export const MAX_VOICE_BYTES = 15 * 1024 * 1024;
export const MAX_VOICE_DURATION_MS = 300_000;
const MAX_MULTIPART_BYTES = MAX_VOICE_BYTES + 64 * 1024;
const MAX_PROBE_OUTPUT = 4 * 1024 * 1024;
let activeUploads = 0;

export class ChatVoiceError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_VOICE') {
    super(message);
    this.name = 'ChatVoiceError';
  }
}

export function voiceUuid(value: unknown, field = 'Identifier'): string {
  if (typeof value !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) {
    throw new ChatVoiceError(`${field} is invalid.`);
  }
  return value;
}

export function voiceTarget(room: unknown, order: unknown): { roomId: string | null; orderId: string | null } {
  const roomId = typeof room === 'string' && room ? room : null;
  const orderId = typeof order === 'string' && order ? order : null;
  if (Number(!!roomId) + Number(!!orderId) !== 1) throw new ChatVoiceError('Choose one chat room or order.');
  if (roomId && (!roomId.trim() || roomId.length > 256 || /[\u0000-\u001f\u007f]/.test(roomId))) throw new ChatVoiceError('The chat room is invalid.');
  if (orderId) voiceUuid(orderId, 'Order');
  return { roomId, orderId };
}

export function voiceCaption(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > 4000) throw new ChatVoiceError('The message must contain at most 4,000 characters.');
  return value.trim();
}

export function claimedVoiceDuration(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,6}$/.test(value)) throw new ChatVoiceError('The recording duration is missing.');
  const milliseconds = Number(value);
  if (milliseconds < 1 || milliseconds > MAX_VOICE_DURATION_MS) throw new ChatVoiceError('Voice recordings can be up to five minutes.');
  return milliseconds;
}

export async function withVoiceUploadSlot<T>(action: () => Promise<T>): Promise<T> {
  if (activeUploads >= 2) throw new ChatVoiceError('Voice uploads are busy. Keep your recording and retry shortly.', 429, 'VOICE_BUSY');
  activeUploads++;
  try { return await action(); } finally { activeUploads--; }
}

/** Bound actual streamed bytes, including requests without Content-Length. */
export async function readVoiceForm(request: Request): Promise<FormData> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_MULTIPART_BYTES) throw new ChatVoiceError('The recording exceeds the 15 MiB limit.', 413, 'VOICE_TOO_LARGE');
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new ChatVoiceError('A recording upload is required.');
  const reader = request.body?.getReader();
  if (!reader) throw new ChatVoiceError('The recording upload is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 60_000);
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new ChatVoiceError('The recording exceeds the 15 MiB limit.', 413, 'VOICE_TOO_LARGE');
      }
      chunks.push(value);
    }
    if (timedOut) throw new ChatVoiceError('The upload took too long. Keep your recording and retry.', 408, 'UPLOAD_TIMEOUT');
    if (request.signal.aborted) throw new ChatVoiceError('The recording upload was cancelled.', 499, 'UPLOAD_CANCELLED');
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return await new Response(new Blob([body.buffer]), { headers: { 'content-type': contentType } }).formData(); }
  catch { throw new ChatVoiceError('The recording upload could not be read.'); }
}

export type VoiceMime = 'audio/webm' | 'audio/ogg' | 'audio/mp4';
export function validateVoiceSignature(bytes: Uint8Array, suppliedMime: string): VoiceMime {
  if (bytes.byteLength === 0) throw new ChatVoiceError('The recording is empty.');
  if (bytes.byteLength > MAX_VOICE_BYTES) throw new ChatVoiceError('The recording exceeds the 15 MiB limit.', 413, 'VOICE_TOO_LARGE');
  const mime = suppliedMime.split(';', 1)[0].trim().toLowerCase();
  const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 65_536)));
  const valid = mime === 'audio/webm'
    ? header.length >= 8 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && header.includes(Buffer.from('webm'))
    : mime === 'audio/ogg'
      ? header.subarray(0, 4).toString('ascii') === 'OggS' && header.includes(Buffer.from('OpusHead'))
      : mime === 'audio/mp4'
        ? header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp' && header.readUInt32BE(0) >= 8
        : false;
  if (!valid) throw new ChatVoiceError('Use an audio recording in WebM, Ogg Opus or MP4 format.', 415, 'UNSUPPORTED_VOICE');
  return mime as VoiceMime;
}

export function inspectProbeResult(result: any): number {
  const streams = Array.isArray(result?.streams) ? result.streams : [];
  if (streams.length !== 1 || streams[0].codec_type !== 'audio' || !['opus', 'aac'].includes(streams[0].codec_name)
    || !Number.isInteger(streams[0].channels) || streams[0].channels < 1 || streams[0].channels > 2) {
    throw new ChatVoiceError('The recording must contain one mono or stereo audio track.', 415, 'UNSUPPORTED_VOICE');
  }
  const packets = Array.isArray(result.packets) ? result.packets : [];
  let start = Infinity, end = -Infinity;
  for (let index = 0; index < packets.length; index++) {
    const packet = packets[index];
    const pts = Number(packet.pts_time);
    let duration = Number(packet.duration_time);
    // Fragmented AAC/MP4 may omit the first packet duration. Its next timestamp
    // is the frame boundary; a final missing duration needs a measured stream end.
    if (!Number.isFinite(duration)) {
      const boundary = index + 1 < packets.length ? Number(packets[index + 1].pts_time)
        : Number(streams[0].duration ?? result.format?.duration);
      duration = boundary - pts;
    }
    if (!Number.isFinite(pts) || !Number.isFinite(duration) || duration < 0) throw new ChatVoiceError('The recording timing could not be verified.');
    start = Math.min(start, pts);
    end = Math.max(end, pts + duration);
  }
  const duration = Math.max(end - start, Number(result.format?.duration) || 0, Number(streams[0].duration) || 0);
  if (!Number.isFinite(duration) || duration <= 0 || start < -2 || start > 2) throw new ChatVoiceError('The recording timing could not be verified.');
  // Codec pre-roll is included in packet timestamps; tolerate at most 100 ms,
  // while the stored/user-facing recording limit remains 300,000 milliseconds.
  if (duration > 300.1) throw new ChatVoiceError('Voice recordings can be up to five minutes.', 400, 'VOICE_TOO_LONG');
  return Math.min(MAX_VOICE_DURATION_MS, Math.max(1, Math.round(duration * 1000)));
}

/** No shell, filename, URL or network protocol from a client enters ffprobe. */
async function probeContainer(bytes: Uint8Array, format: string, signal?: AbortSignal, packets = true): Promise<any> {
  const output = await new Promise<string>((resolve, reject) => {
    let settled = false;
    let size = 0;
    let stderrSize = 0;
    const chunks: Buffer[] = [];
    const proc = spawn('ffprobe', ['-v', 'error', '-max_alloc', '67108864', '-protocol_whitelist', 'pipe',
      '-f', format, '-i', 'pipe:0', ...(packets ? ['-show_packets'] : []), '-show_streams', '-show_format',
      '-show_entries', 'packet=pts_time,duration_time:stream=codec_type,codec_name,channels,duration:format=duration', '-of', 'json'],
    { stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) { proc.kill('SIGKILL'); reject(error); }
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const abort = () => finish(new ChatVoiceError('The recording upload was cancelled.', 499, 'UPLOAD_CANCELLED'));
    const timer = setTimeout(() => finish(new ChatVoiceError('The recording could not be checked in time. Retry with a shorter clip.', 422, 'VOICE_PROCESSING_TIMEOUT')), 10_000);
    proc.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PROBE_OUTPUT) finish(new ChatVoiceError('The recording contains too much media data.', 422, 'INVALID_VOICE'));
      else chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => { stderrSize += chunk.length; if (stderrSize > 64 * 1024) finish(new ChatVoiceError('The recording could not be verified.')); });
    proc.on('error', () => finish(new ChatVoiceError('Voice recording support needs the server audio processor. Contact R&D.', 503, 'VOICE_PROCESSOR_UNAVAILABLE')));
    proc.on('close', (code) => finish(code === 0 ? undefined : new ChatVoiceError('The recording is damaged or unsupported.', 422, 'INVALID_VOICE')));
    proc.stdin.on('error', () => { /* Process error/close provides the safe message. */ });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else proc.stdin.end(bytes);
  });
  try { return JSON.parse(output); }
  catch (error) {
    if (error instanceof ChatVoiceError) throw error;
    throw new ChatVoiceError('The recording could not be verified.');
  }
}

export async function probeVoice(bytes: Uint8Array, mime: VoiceMime, signal?: AbortSignal): Promise<number> {
  const format = { 'audio/webm': 'matroska', 'audio/ogg': 'ogg', 'audio/mp4': 'mov' }[mime];
  return inspectProbeResult(await probeContainer(bytes, format, signal));
}

/** Recognize generic-picker audio even when the browser supplies no audio MIME. */
export async function containsAudioOnly(bytes: Uint8Array, signal?: AbortSignal): Promise<boolean> {
  const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 65_536)));
  if (header.subarray(0, 3).toString('ascii') === 'ID3' || header.subarray(0, 4).toString('ascii') === 'fLaC'
    || (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WAVE')
    || (header.subarray(0, 4).toString('ascii') === 'FORM' && ['AIFF', 'AIFC'].includes(header.subarray(8, 12).toString('ascii')))
    || (header.length > 1 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) return true;
  const format = header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? 'matroska'
    : header.subarray(4, 8).toString('ascii') === 'ftyp' ? 'mov'
      : header.subarray(0, 4).toString('ascii') === 'OggS' ? 'ogg' : null;
  if (!format) return false;
  const result = await withVoiceUploadSlot(() => probeContainer(bytes, format, signal, false));
  if (!Array.isArray(result.streams) || !result.streams.length) throw new ChatVoiceError('The media file could not be verified.');
  return result.streams.some((stream: any) => stream.codec_type === 'audio') && !result.streams.some((stream: any) => stream.codec_type === 'video');
}

export function voiceDigest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

export function audioRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) throw new ChatVoiceError('Requested audio range is unavailable.', 416, 'INVALID_RANGE');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start
    || (!match[1] && Number(match[2]) <= 0)) throw new ChatVoiceError('Requested audio range is unavailable.', 416, 'INVALID_RANGE');
  return { start, end };
}
