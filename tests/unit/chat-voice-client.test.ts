import { describe, expect, it } from 'vitest';
import { durationLabel, recordingExtension, recordingMimeType, voiceExpired, voicePlaybackURL, VOICE_MAX_BYTES, VOICE_MAX_DURATION_MS } from '../../src/lib/chat/voice';
import { parseOrderChatMessage } from '../../src/lib/components/chat/order-chat-state';
import type { Attachment } from '../../src/lib/chat/types';

const voice: Attachment = { id: 'voice-one', fileName: 'voice.webm', fileType: 'audio/webm', fileSize: 1024, kind: 'voice', url: '/api/chat/voice/voice-one', duration: 12, expiresAt: '2027-01-31T12:00:00Z' };
describe('voice client protocol and display', () => {
  it('negotiates an explicitly supported format and does not assume WebM', () => {
    expect(recordingMimeType(type => type === 'audio/mp4')).toBe('audio/mp4');
    expect(recordingMimeType(type => type === 'audio/ogg;codecs=opus')).toBe('audio/ogg;codecs=opus');
    expect(recordingMimeType(() => false)).toBe(null);
    expect(recordingExtension('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(recordingExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(VOICE_MAX_BYTES).toBe(15 * 1024 * 1024);
    expect(VOICE_MAX_DURATION_MS).toBe(300000);
  });
  it('enforces the exact supplied expiry boundary and never follows an arbitrary voice URL', () => {
    expect(voiceExpired(voice, Date.parse('2027-01-31T11:59:59.999Z'))).toBe(false);
    expect(voiceExpired(voice, Date.parse('2027-01-31T12:00:00Z'))).toBe(true);
    expect(voiceExpired({ ...voice, expired: true }, 0)).toBe(true);
    expect(voicePlaybackURL({ ...voice, expiresAt: null, url: 'https://outside.invalid/private-audio' })).toBe('/api/chat/voice/voice-one');
    expect(voicePlaybackURL({ ...voice, expired: true })).toBe(null);
    expect(durationLabel(59999)).toBe('0:59');
    expect(durationLabel(300000)).toBe('5:00');
  });
  it('preserves structured voice metadata and legacy file URLs in order messages, including voice-only text', () => {
    const result = parseOrderChatMessage({ id: 'message', userId: 'worker', username: 'Worker', message: '', timestamp: '2026-10-31T12:00:00Z', attachments: ['/legacy/file.pdf'], voiceAttachments: [voice] });
    expect(result?.message).toBe('');
    expect(result?.attachments).toEqual(['/legacy/file.pdf']);
    expect(result?.voiceAttachments?.[0]).toMatchObject({ id: 'voice-one', expiresAt: '2027-01-31T12:00:00Z', kind: 'voice' });
  });
});
