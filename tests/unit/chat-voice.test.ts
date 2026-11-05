import { describe, it, expect } from 'vitest';
import assert from 'node:assert/strict';
import { audioRange, ChatVoiceError, claimedVoiceDuration, inspectProbeResult, readVoiceForm, validateVoiceSignature, voiceTarget, withVoiceUploadSlot } from '../../src/lib/server/chat/voice-validation';
import { voiceAttachment } from '../../src/lib/server/chat/voice-service';
import { cleanupExpiredVoices } from '../../src/lib/server/chat/voice-retention';
import { POST as genericUpload } from '../../src/routes/api/chat/attachments/+server';
import { POST as directRoom } from '../../src/routes/api/chat/dm/+server';
import { GET as playVoice } from '../../src/routes/api/chat/voice/[id]/+server';
import { POST as sendVoice } from '../../src/routes/api/chat/voice/+server';

const actor = '11111111-1111-4111-8111-111111111111';
const peer = '22222222-2222-4222-8222-222222222222';

async function withStorageFixture(run: () => Promise<void>) {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.PUBLIC_SUPABASE_URL = 'https://voice-db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'voice-test-private-fixture-key';
  try { await run(); } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.PUBLIC_SUPABASE_URL; else process.env.PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
}

describe('voice recording boundary', () => {
  it('requires a supported matching MIME and byte signature', () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from('webm')]);
    expect(validateVoiceSignature(webm, 'audio/webm;codecs=opus')).toBe('audio/webm');
    expect(() => validateVoiceSignature(webm, 'audio/mp4')).toThrow();
    expect(() => validateVoiceSignature(Buffer.from('<html>not audio</html>'), 'audio/webm')).toThrow();
    expect(() => validateVoiceSignature(webm, 'application/octet-stream')).toThrow();
    expect(() => validateVoiceSignature(new Uint8Array(), 'audio/webm')).toThrow();
    expect(() => claimedVoiceDuration('300001')).toThrow();
    expect(() => claimedVoiceDuration('1e5')).toThrow();
    expect(voiceTarget('general', null)).toEqual({ roomId: 'general', orderId: null });
    expect(() => voiceTarget('general', peer)).toThrow();
    expect(voiceTarget('montāža', null).roomId).toBe('montāža');
    expect(() => voiceTarget('private\u0000room', null)).toThrow();
  });

  it('measures streaming WebM packets without trusting the client or container duration', () => {
    const stream = { codec_type: 'audio', codec_name: 'opus', channels: 1 };
    expect(inspectProbeResult({ streams: [stream], packets: [{ pts_time: '-0.007', duration_time: '0.02' }, { pts_time: '1.973', duration_time: '0.02' }] })).toBe(2000);
    expect(inspectProbeResult({ streams: [{ ...stream, codec_name: 'aac', duration: '1.5' }], packets: [{ pts_time: '0' }, { pts_time: '1.48', duration_time: '0.02' }] })).toBe(1500);
    expect(() => inspectProbeResult({ streams: [stream], packets: [{ pts_time: '0', duration_time: '301' }] })).toThrow();
    expect(() => inspectProbeResult({ streams: [stream, { codec_type: 'video' }], packets: [] })).toThrow();
    expect(() => inspectProbeResult({ streams: [stream], packets: [] })).toThrow();
    expect(() => inspectProbeResult({ streams: [stream], packets: [{ pts_time: '1000', duration_time: '1' }] })).toThrow();
  });

  it('supports single audio ranges and rejects unsatisfiable/multiple ranges', () => {
    expect(audioRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
    expect(audioRange('bytes=50-', 100)).toEqual({ start: 50, end: 99 });
    expect(audioRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(audioRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99 });
    for (const bad of ['bytes=100-', 'bytes=2-1', 'bytes=-0', 'bytes=0-1,5-9']) expect(() => audioRange(bad, 100)).toThrow();
  });

  it('expires metadata at the exact deadline and never exposes a raw Storage path', () => {
    const row = { id: actor, file_name: 'Voice.webm', file_type: 'audio/webm', file_size: 100, duration_secs: 2,
      voice_state: 'ready', voice_expires_at: '2027-02-28T10:00:00Z', storage_path: 'private/path', created_at: '2026-11-30T10:00:00Z' };
    const live = voiceAttachment(row, Date.parse(row.voice_expires_at) - 1);
    expect(live.url).toBe(`/api/chat/voice/${actor}`);
    expect(live.storagePath).toBe(undefined);
    const expired = voiceAttachment(row, Date.parse(row.voice_expires_at));
    expect(expired.expired).toBe(true); expect(expired.url).toBe(null);
    expect(voiceAttachment({ ...row, voice_state: 'deleted' }, 0).expired).toBe(true);
  });

  it('bounds simultaneous uploads and releases a slot after failure', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const one = withVoiceUploadSlot(() => gate);
    const two = withVoiceUploadSlot(() => gate);
    await assert.rejects(withVoiceUploadSlot(async () => true), (error) => error instanceof ChatVoiceError && error.status === 429);
    release(); await Promise.all([one, two]);
    await assert.rejects(withVoiceUploadSlot(async () => { throw new Error('failed'); }));
    expect(await withVoiceUploadSlot(async () => true)).toBe(true);
  });

  it('rejects oversized declared bodies before reading and bounds real streamed bytes', async () => {
    const declared = new Request('http://oms.test/upload', { method: 'POST', headers: { 'content-length': String(16 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' }, body: '' });
    await assert.rejects(readVoiceForm(declared), (error) => error instanceof ChatVoiceError && error.status === 413);
    const actual = new Request('http://oms.test/upload', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: new Uint8Array(16 * 1024 * 1024) });
    await assert.rejects(readVoiceForm(actual), (error) => error instanceof ChatVoiceError && error.status === 413);
  });

  it('blocks audio through the old generic-upload bypass and binds DM creation to the signed-in actor', async () => {
    const form = new FormData(); form.append('roomId', 'general'); form.append('file', new File(['audio'], 'recording.webm', { type: 'audio/webm' }));
    const response = await genericUpload({ locals: { user: { id: actor } }, request: new Request('http://oms.test/upload', { method: 'POST', body: form }) } as any);
    expect(response.status).toBe(400); expect((await response.json()).code).toBe('USE_VOICE_UPLOAD');
    const calls: unknown[] = [];
    const opened = await directRoom({ locals: { user: { id: actor }, supabase: { rpc: async (name: string, args: any) => { calls.push([name, args]); return { data: { id: 'dm-known' }, error: null }; } } }, request: new Request('http://oms.test/dm', { method: 'POST', body: JSON.stringify({ peerId: peer, actorId: 'forged' }) }) } as any);
    expect(opened.status).toBe(200); expect(calls).toEqual([['chat_create_dm', { p_peer: peer }]]);
  });
});

describe('voice Storage retention dispatch', () => {
  it('deletes only the leased binary through Storage and completes its exact token', async () => {
    const calls: any[] = [];
    const db: any = {
      rpc: async (name: string, args: any) => { calls.push([name, args]); return { data: name === 'chat_voice_claim_cleanup' ? [{ jobId: actor, leaseToken: peer, bucket: 'chat-voice', path: 'voices/known.webm' }] : true, error: null }; },
      storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => { calls.push(['remove', bucket, paths]); return { error: null }; } }) }
    };
    expect(await cleanupExpiredVoices(db)).toEqual({ removed: 1, failed: 0 });
    expect(calls[1]).toEqual(['remove', 'chat-voice', ['voices/known.webm']]);
    expect(calls[2]).toEqual(['chat_voice_complete_cleanup', { p_job_id: actor, p_lease_token: peer }]);
    expect(calls.some((call) => String(call[0]).includes('message'))).toBe(false);
  });

  it('retries failed storage deletion and treats an already missing object as successful', async () => {
    for (const status of [503, 404]) {
      const calls: string[] = [];
      const db: any = {
        rpc: async (name: string) => { calls.push(name); return { data: name === 'chat_voice_claim_cleanup' ? [{ jobId: actor, leaseToken: peer, bucket: 'chat-attachments', path: 'legacy/audio.ogg' }] : true, error: null }; },
        storage: { from: () => ({ remove: async () => ({ error: { statusCode: String(status) } }) }) }
      };
      const result = await cleanupExpiredVoices(db);
      expect(result.failed).toBe(status === 503 ? 1 : 0);
      expect(calls.includes(status === 503 ? 'chat_voice_retry_cleanup' : 'chat_voice_complete_cleanup')).toBe(true);
    }
  });
});

describe('voice HTTP playback boundary', () => {
  it('rejects unsigned uploads/playback before reading a recording or opening Storage', async () => {
    expect((await sendVoice({ locals: {}, request: new Request('http://oms.test/voice', { method: 'POST', body: 'invalid' }) } as any)).status).toBe(401);
    expect((await playVoice({ locals: {}, params: { id: actor }, request: new Request('http://oms.test/voice') } as any)).status).toBe(401);
  });

  it('returns the requested media range with private/no-store and checks access twice', async () => {
    await withStorageFixture(async () => {
      let accessChecks = 0, downloads = 0;
      globalThis.fetch = async (url) => {
        expect(String(url).includes('/storage/v1/object/')).toBe(true);
        downloads++;
        return new Response(new Blob(['0123456789']), { status: 200 });
      };
      const response = await playVoice({ params: { id: actor }, request: new Request('http://oms.test/voice', { headers: { range: 'bytes=2-5' } }),
        locals: { user: { id: peer }, supabase: { rpc: async () => { accessChecks++; return { data: { id: actor, storage_bucket: 'chat-voice', storage_path: 'voices/known.webm', file_type: 'audio/webm', file_size: 10 }, error: null }; } } } } as any);
      expect(response.status).toBe(206);
      expect(await response.text()).toBe('2345');
      expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(accessChecks).toBe(2); expect(downloads).toBe(1);
    });
  });

  it('denies expiry before Storage and permission revocation during download without returning bytes', async () => {
    await withStorageFixture(async () => {
      let downloads = 0;
      globalThis.fetch = async () => { downloads++; return new Response('0123456789'); };
      const makeEvent = (rpc: any) => ({ params: { id: actor }, request: new Request('http://oms.test/voice'), locals: { user: { id: peer }, supabase: { rpc } } } as any);
      const expired = await playVoice(makeEvent(async () => ({ data: null, error: { code: 'P0003' } })));
      expect(expired.status).toBe(410); expect(downloads).toBe(0);
      let checks = 0;
      const revoked = await playVoice(makeEvent(async () => ++checks === 1
        ? { data: { storage_bucket: 'chat-voice', storage_path: 'voices/known.webm', file_type: 'audio/webm', file_size: 10 }, error: null }
        : { data: null, error: { code: '42501' } }));
      expect(revoked.status).toBe(403);
      expect((await revoked.json()).code).toBe('FORBIDDEN'); expect(downloads).toBe(1);
    });
  });
});
