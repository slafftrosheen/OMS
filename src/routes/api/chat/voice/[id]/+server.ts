import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChatVoiceDatabase } from '$lib/server/chat/voice-runtime';
import { voiceRpc } from '$lib/server/chat/voice-service';
import { audioRange, ChatVoiceError, voiceUuid } from '$lib/server/chat/voice-validation';

const privateHeaders = { 'cache-control': 'private, no-store', pragma: 'no-cache', 'x-content-type-options': 'nosniff', vary: 'Cookie, Range' };

export const GET: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Sign in to play this recording.', code: 'AUTH_REQUIRED' }, { status: 401, headers: privateHeaders });
  try {
    const id = voiceUuid(params.id, 'Recording');
    // Rechecks active account, room/order permission, message visibility and the
    // authoritative database deadline on EVERY media/range request.
    const record = await voiceRpc(locals.supabase, 'chat_voice_playback', { p_attachment_id: id });
    const service = getChatVoiceDatabase();
    if (!service) throw new ChatVoiceError('Voice playback is temporarily unavailable.', 503, 'VOICE_SETUP_REQUIRED');
    const range = audioRange(request.headers.get('range'), Number(record.file_size));
    const { data, error } = await service.storage.from(record.storage_bucket).download(record.storage_path);
    if (error || !data) throw new ChatVoiceError('The recording could not be loaded. Please retry.', 503, 'VOICE_UNAVAILABLE');
    // Download time must not extend the access window. A fresh SQL check also
    // handles access being revoked while Storage is responding.
    await voiceRpc(locals.supabase, 'chat_voice_playback', { p_attachment_id: id });
    const headers: Record<string, string> = {
      ...privateHeaders, 'content-type': record.file_type, 'accept-ranges': 'bytes',
      'content-disposition': 'inline; filename="voice-message"'
    };
    if (data.size !== Number(record.file_size)) throw new ChatVoiceError('The recording is unavailable.', 503, 'VOICE_UNAVAILABLE');
    if (range) {
      headers['content-range'] = `bytes ${range.start}-${range.end}/${data.size}`;
      headers['content-length'] = String(range.end - range.start + 1);
      return new Response(data.slice(range.start, range.end + 1, record.file_type), { status: 206, headers });
    }
    headers['content-length'] = String(data.size);
    return new Response(data, { headers });
  } catch (error) {
    if (error instanceof ChatVoiceError) return json({ error: error.message, code: error.code }, { status: error.status, headers: privateHeaders });
    return json({ error: 'Voice playback is temporarily unavailable.', code: 'VOICE_UNAVAILABLE' }, { status: 503, headers: privateHeaders });
  }
};

export const HEAD: RequestHandler = async (event) => {
  const response = await GET(event);
  return new Response(null, { status: response.status, headers: response.headers });
};
