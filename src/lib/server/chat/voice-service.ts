import type { SupabaseClient } from '@supabase/supabase-js';
import type { Attachment, Message } from '$lib/chat/types';
import { ChatVoiceError } from './voice-validation';

type Database = SupabaseClient<any, any, any>;
type Row = Record<string, any>;

export function voiceDatabaseError(error: any): never {
  if (error?.code === '42501') throw new ChatVoiceError('You no longer have access to this chat.', 403, 'FORBIDDEN');
  if (error?.code === 'P0002') throw new ChatVoiceError('The recording was not found.', 404, 'NOT_FOUND');
  if (error?.code === 'P0003') throw new ChatVoiceError('This recording or unfinished upload has expired.', 410, 'UPLOAD_EXPIRED');
  if (error?.code === '40001' || error?.code === '23505') throw new ChatVoiceError('This send identifier belongs to a different recording. Start a new recording or retry the original.', 409, 'VOICE_CONFLICT');
  if (['22023', '23514', '22P02'].includes(error?.code)) throw new ChatVoiceError('Check the recording and chat destination.');
  if (['42P01', '42883', 'PGRST202', 'PGRST205', '42703'].includes(error?.code)) {
    throw new ChatVoiceError('Voice messages need the chat database update. Contact R&D.', 503, 'VOICE_SETUP_REQUIRED');
  }
  throw new ChatVoiceError('The recording could not be saved. Keep it and retry.', 503, 'VOICE_UNAVAILABLE');
}

export async function voiceRpc(db: Database, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await db.rpc(name, args);
  if (error) voiceDatabaseError(error);
  return data;
}

export function voiceAttachment(row: Row, now = Date.now()): Attachment {
  const expiry = typeof row.voice_expires_at === 'string' ? row.voice_expires_at : null;
  const expired = row.voice_state !== 'ready' || !expiry || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= now;
  return {
    id: row.id, fileName: row.file_name || 'Voice message', fileType: row.file_type,
    fileSize: Number(row.file_size), kind: 'voice', duration: Number(row.duration_secs) || null,
    url: expired ? null : `/api/chat/voice/${encodeURIComponent(row.id)}`,
    expiresAt: expiry, expired, createdAt: row.created_at
  };
}

export async function messageVoices(db: Database, ids: string[]): Promise<Map<string, Attachment[]>> {
  const result = new Map<string, Attachment[]>();
  if (!ids.length) return result;
  const { data, error } = await db.from('chat_attachments')
    .select('id,message_id,file_name,file_type,file_size,attachment_kind,duration_secs,created_at,voice_expires_at,voice_state')
    .in('message_id', ids).eq('attachment_kind', 'voice').order('created_at');
  if (error) {
    // Preserve existing text history while the additive voice migration is pending.
    if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)) return result;
    voiceDatabaseError(error);
  }
  for (const row of data ?? []) {
    const list = result.get(row.message_id) || [];
    list.push(voiceAttachment(row));
    result.set(row.message_id, list);
  }
  return result;
}

/** Never revive a legacy raw audio URL from a message's untrusted JSON field. */
export function nonVoiceAttachments(value: unknown): any[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string'
    || (item && typeof item === 'object' && item.kind !== 'voice' && !String(item.fileType || item.file_type || '').startsWith('audio/'))) : [];
}

export async function committedVoiceMessage(db: Database, result: Row): Promise<{ message: any; attachment: Attachment }> {
  const row = result.message;
  const attachment = voiceAttachment(result.attachment);
  const { data: profile } = await db.from('profiles').select('id,username,display_name,avatar_url').eq('id', row.user_id).maybeSingle();
  if (row.order_id && !row.room_id) return {
    attachment,
    message: {
      id: row.id, orderId: row.order_id, userId: row.user_id, username: profile?.username || '',
      message: row.content ?? row.text ?? '', timestamp: row.created_at, attachments: nonVoiceAttachments(row.attachments).filter((item) => typeof item === 'string'),
      voiceAttachments: [attachment], replyTo: row.reply_to_id, edited: false, deleted: false
    }
  };
  const message: Message = {
    id: row.id, roomId: row.room_id, authorId: row.user_id, ts: row.created_at,
    text: row.content ?? row.text ?? '', attachments: [attachment], replyToId: row.reply_to_id, variant: 'user', mentions: [],
    author: profile ? { id: profile.id, displayName: profile.display_name, username: profile.username, avatarUrl: profile.avatar_url } : null
  };
  return { message, attachment };
}
