import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChatVoiceDatabase } from '$lib/server/chat/voice-runtime';
import { committedVoiceMessage, voiceRpc } from '$lib/server/chat/voice-service';
import {
  ChatVoiceError, claimedVoiceDuration, probeVoice, readVoiceForm, validateVoiceSignature,
  voiceCaption, voiceDigest, voiceTarget, voiceUuid, withVoiceUploadSlot
} from '$lib/server/chat/voice-validation';

const noStore = { 'cache-control': 'private, no-store' };

export const POST: RequestHandler = async ({ request, locals }) => {
  // Reject unauthenticated clients before allocating multipart/probe resources.
  if (!locals.user) return json({ success: false, error: 'Sign in to send a voice message.', code: 'AUTH_REQUIRED' }, { status: 401, headers: noStore });
  try {
    return await withVoiceUploadSlot(async () => {
      const service = getChatVoiceDatabase();
      if (!service) throw new ChatVoiceError('Voice messages need server storage configuration. Contact R&D.', 503, 'VOICE_SETUP_REQUIRED');
      const form = await readVoiceForm(request);
      const target = voiceTarget(form.get('roomId'), form.get('orderId'));
      const requestId = voiceUuid(form.get('clientRequestId'), 'Send identifier');
      claimedVoiceDuration(form.get('durationMs'));
      const text = voiceCaption(form.get('text'));
      const replyTo = form.get('replyTo') ? voiceUuid(form.get('replyTo'), 'Reply') : null;
      const file = form.get('file');
      if (!(file instanceof File)) throw new ChatVoiceError('Choose a recording to send.');
      const allowed = await voiceRpc(locals.supabase, 'chat_can_send_to', { p_order_id: target.orderId, p_room_id: target.roomId });
      if (allowed !== true) throw new ChatVoiceError('You no longer have access to this chat.', 403, 'FORBIDDEN');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = validateVoiceSignature(bytes, file.type);
      const duration = await probeVoice(bytes, mime, request.signal);
      const reserved = await voiceRpc(service, 'chat_voice_reserve', {
        p_actor: locals.user!.id, p_room_id: target.roomId, p_order_id: target.orderId, p_request_id: requestId,
        p_mime: mime, p_size: bytes.byteLength, p_duration_ms: duration, p_sha256: voiceDigest(bytes), p_text: text, p_reply_to: replyTo
      });
      if (reserved.voice_state !== 'ready') {
        // Identical requests share an immutable content hash; overwrite is only
        // for recovery from a lost upload response, never a different recording.
        const { error } = await service.storage.from(reserved.storage_bucket).upload(reserved.storage_path, bytes,
          { contentType: mime, cacheControl: '0', upsert: true });
        if (error) throw new ChatVoiceError('The recording upload failed. Keep it and retry.', 503, 'VOICE_UPLOAD_FAILED');
      }
      const committed = await voiceRpc(service, 'chat_voice_commit', { p_actor: locals.user!.id, p_attachment_id: reserved.id });
      const result = await committedVoiceMessage(locals.supabase, committed);
      return json({ success: true, ...result }, { headers: noStore });
    });
  } catch (error) {
    if (error instanceof ChatVoiceError) return json({ success: false, error: error.message, code: error.code }, { status: error.status, headers: noStore });
    console.error('[chat voice] send failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return json({ success: false, error: 'The voice message could not be confirmed. Keep the recording and retry.', code: 'VOICE_UNAVAILABLE' }, { status: 503, headers: noStore });
  }
};
