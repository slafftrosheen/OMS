import { base } from '$app/paths';
import type { Attachment, VoiceDraft, VoiceTarget } from './types';

export const VOICE_MAX_DURATION_MS = 5 * 60 * 1000;
export const VOICE_MAX_BYTES = 15 * 1024 * 1024;
export const VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'
] as const;

export function recordingMimeType(supports: (mime: string) => boolean): string | null {
  return VOICE_MIME_CANDIDATES.find(mime => supports(mime)) ?? null;
}
export function recordingExtension(type: string): string {
  return type.toLowerCase().startsWith('audio/mp4') ? 'm4a' : type.toLowerCase().startsWith('audio/ogg') ? 'ogg' : 'webm';
}
export function durationLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function voiceExpired(attachment: Pick<Attachment, 'expiresAt' | 'expired'>, now = Date.now()): boolean {
  if (attachment.expired) return true;
  const timestamp = attachment.expiresAt ? Date.parse(attachment.expiresAt) : NaN;
  return Number.isFinite(timestamp) && timestamp <= now;
}
export function voicePlaybackURL(attachment: Attachment): string | null {
  if (attachment.kind !== 'voice' || !attachment.id || voiceExpired(attachment)) return null;
  // Voice is always streamed through the authorization boundary, never a supplied public URL.
  return attachment.url ? `${base}/api/chat/voice/${encodeURIComponent(attachment.id)}` : null;
}
export class VoiceTransferError extends Error {
  constructor(public status: number, public code: string) { super(code); this.name = 'VoiceTransferError'; }
}
export async function postVoiceMessage<T>(target: VoiceTarget, draft: VoiceDraft, signal: AbortSignal, options: { replyTo?: string; text?: string } = {}): Promise<{ success: true; message: T; attachment: Attachment }> {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (draft.file.size > VOICE_MAX_BYTES) throw new VoiceTransferError(413, 'VOICE_TOO_LARGE');
  const form = new FormData();
  if (target.roomId) form.append('roomId', target.roomId);
  else if (target.orderId) form.append('orderId', target.orderId);
  form.append('file', draft.file); form.append('durationMs', String(draft.durationMs)); form.append('clientRequestId', draft.clientRequestId);
  if (options.replyTo) form.append('replyTo', options.replyTo);
  if (options.text?.trim()) form.append('text', options.text.trim());
  const response = await fetch(`${base}/api/chat/voice`, { method: 'POST', body: form, credentials: 'include', cache: 'no-store', signal });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success || typeof result.attachment?.id !== 'string' || !result.message) {
    throw new VoiceTransferError(response.status, typeof result?.code === 'string' ? result.code : 'VOICE_SEND_FAILED');
  }
  return result;
}
