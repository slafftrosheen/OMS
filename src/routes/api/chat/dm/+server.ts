import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { voiceRpc } from '$lib/server/chat/voice-service';
import { ChatVoiceError, voiceUuid } from '$lib/server/chat/voice-validation';

/** Create only the deterministic two-person room, without broad room/member grants. */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!locals.supabase) return json({ error: 'Database unavailable' }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({}));
    const peerId = voiceUuid(body.peerId, 'Peer');
    if (peerId === locals.user.id) throw new ChatVoiceError('Choose another team member.');
    const room = await voiceRpc(locals.supabase, 'chat_create_dm', { p_peer: peerId });
    return json({ success: true, room }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ChatVoiceError) return json({ success: false, error: error.message, code: error.code }, { status: error.status });
    return json({ success: false, error: 'The direct chat could not be opened.' }, { status: 503 });
  }
};
