import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const roomId = url.searchParams.get('roomId');
  const { data: messages } = await locals.supabase
    .from('chat_messages')
    .select('*, profiles(username)')
    .eq('room_id', roomId)
    .order('created_at');

  return json(messages || []);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const { data: msg, error } = await locals.supabase
    .from('chat_messages')
    .insert({
        room_id: data.roomId,
        user_id: session.user.id,
        content: data.content,
        attachments: data.attachments || []
    })
    .select()
    .single();

  if (error) return json({ error: 'Failed' }, { status: 500 });
  return json(msg);
};
