import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { voiceAttachment, voiceRpc } from '$lib/server/chat/voice-service';
import { ChatVoiceError, containsAudioOnly, voiceTarget, voiceUuid } from '$lib/server/chat/voice-validation';
import { getChatVoiceDatabase } from '$lib/server/chat/voice-runtime';

const headers = { 'cache-control': 'private, no-store' };
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const audioExtension = /\.(?:mp3|wav|wave|m4a|aac|ogg|oga|opus|flac|aif|aiff)$/i;
const failure = (error: unknown) => error instanceof ChatVoiceError
  ? json({ success: false, error: error.message, code: error.code }, { status: error.status, headers })
  : json({ success: false, error: 'The attachment is temporarily unavailable.' }, { status: 503, headers });

/** Legacy file/image/video endpoint. Audio uses the validated, expiring voice flow. */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    if (Number(request.headers.get('content-length')) > MAX_FILE_SIZE + 65_536) throw new ChatVoiceError('File exceeds 50 MB limit.', 413);
    const form = await request.formData();
    const { roomId } = voiceTarget(form.get('roomId'), null);
    const messageId = form.get('messageId') ? voiceUuid(form.get('messageId'), 'Message') : null;
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new ChatVoiceError('Choose a file.');
    if (file.size > MAX_FILE_SIZE) throw new ChatVoiceError('File exceeds 50 MB limit.', 413);
    if (file.type.toLowerCase().startsWith('audio/') || audioExtension.test(file.name)) {
      throw new ChatVoiceError('Use the voice recording control to send audio with three-month retention.', 400, 'USE_VOICE_UPLOAD');
    }
    if (await voiceRpc(locals.supabase, 'chat_can_send_to', { p_order_id: null, p_room_id: roomId }) !== true) throw new ChatVoiceError('You cannot attach files to this chat.', 403, 'FORBIDDEN');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (await containsAudioOnly(bytes, request.signal)) throw new ChatVoiceError('Use the voice recording control to send audio with three-month retention.', 400, 'USE_VOICE_UPLOAD');
    const service = getChatVoiceDatabase();
    if (!service) throw new ChatVoiceError('Chat file storage needs server configuration. Contact R&D.', 503, 'VOICE_SETUP_REQUIRED');
    if (messageId) {
      const { data, error } = await locals.supabase.from('chat_messages').select('id,room_id,order_id,user_id,is_deleted').eq('id', messageId).maybeSingle();
      if (error || !data || data.room_id !== roomId || data.order_id || data.user_id !== locals.user.id || data.is_deleted) throw new ChatVoiceError('The message does not belong to this chat or account.', 403, 'FORBIDDEN');
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const safeExt = /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
    const storagePath = `files/${locals.user.id}/${randomUUID()}.${safeExt}`;
    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
    const bucket = service.storage.from('chat-attachments');
    const { error: uploadError } = await bucket.upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadError) throw new ChatVoiceError('The file could not be uploaded. Please retry.', 503, 'UPLOAD_FAILED');
    let row: any;
    try { row = await voiceRpc(service, 'chat_voice_store_file', {
      p_message: messageId, p_room: roomId, p_actor: locals.user.id, p_name: file.name.slice(0, 255),
      p_mime: file.type || 'application/octet-stream', p_size: file.size, p_path: storagePath, p_kind: kind
    }); } catch (error) {
      await bucket.remove([storagePath]).catch(() => {});
      throw error;
    }
    const { data: signed } = await bucket.createSignedUrl(storagePath, 3600);
    return json({ success: true, attachment: {
      id: row.id, fileName: row.file_name, fileType: row.file_type, fileSize: row.file_size, kind: row.attachment_kind,
      url: signed?.signedUrl || null, createdAt: row.created_at
    } }, { headers });
  } catch (error) { return failure(error); }
};

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const roomId = url.searchParams.get('roomId');
    const messageId = url.searchParams.get('messageId');
    if (!roomId && !messageId) throw new ChatVoiceError('Choose a room or message.');
    if (roomId) voiceTarget(roomId, null);
    if (messageId) voiceUuid(messageId, 'Message');
    let query = locals.supabase.from('chat_attachments').select('*').order('created_at').limit(200);
    if (roomId) query = query.eq('room_id', roomId);
    if (messageId) query = query.eq('message_id', messageId);
    const { data, error } = await query;
    if (error) throw new ChatVoiceError('The attachments could not be loaded.', 503, 'UNAVAILABLE');
    const attachments = await Promise.all((data || []).map(async (row: any) => {
      if (row.attachment_kind === 'voice' || String(row.file_type).startsWith('audio/')) return { ...voiceAttachment(row), messageId: row.message_id };
      const { data: signed } = await locals.supabase.storage.from('chat-attachments').createSignedUrl(row.storage_path, 3600);
      return {
        id: row.id, messageId: row.message_id, fileName: row.file_name, fileType: row.file_type, fileSize: row.file_size,
        kind: row.attachment_kind, url: signed?.signedUrl || null, duration: row.duration_secs, width: row.width, height: row.height, createdAt: row.created_at
      };
    }));
    return json({ success: true, attachments }, { headers });
  } catch (error) { return failure(error); }
};
