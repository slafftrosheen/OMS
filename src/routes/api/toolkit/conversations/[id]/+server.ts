// Per-user discussion and proposals for an otherwise shared team canvas.
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { normalizeProposals } from '$lib/components/canvas/toolkit-context';

const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function cleanMessages(value: unknown) {
  if (!Array.isArray(value) || value.length > 60) throw error(400, 'Up to 60 messages are permitted');
  return value.filter((m): m is {role: string; content: string} =>
    !!m && typeof m === 'object' && ['user','assistant'].includes(m.role) &&
    typeof m.content === 'string' && m.content.length <= 5000
  ).map(m => ({ role: m.role, content: m.content }));
}
async function requireVisibleBoard(db: any, id: string) {
  if (!uuid.test(id)) throw error(400, 'Invalid project ID');
  const { data, error: dbError } = await db.from('canvas_documents').select('id').eq('id', id).maybeSingle();
  if (dbError) throw error(503, 'Project access unavailable');
  if (!data) throw error(404, 'Project not found');
}
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireToolkitManager(locals.user);
  await requireVisibleBoard(locals.supabase, params.id);
  const { data, error: dbError } = await locals.supabase.from('toolkit_canvas_conversations')
    .select('messages,proposals,node_threads,updated_at').eq('canvas_id', params.id)
    .eq('user_id', user.id).maybeSingle();
  if (dbError) throw error(503, 'Private discussion unavailable');
  return json({ messages: data?.messages ?? [], proposals: data?.proposals ?? [],
    legacyThreads: data?.node_threads ?? {} }, { headers });
};
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = requireToolkitManager(locals.user);
  await requireVisibleBoard(locals.supabase, params.id);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid discussion');
  if (JSON.stringify(body).length > 320_000) throw error(413, 'Discussion exceeds size limit');
  const messages = cleanMessages(body.messages);
  if (!Array.isArray(body.proposals) || body.proposals.length > 8) throw error(400, 'Invalid proposals');
  const proposals = normalizeProposals(body.proposals);
  // Update only the discussion columns, never the archived legacy node_threads.
  // A generic upsert could reset unspecified columns to their defaults.
  const now = new Date().toISOString();
  const { data: existing, error: updateError } = await locals.supabase
    .from('toolkit_canvas_conversations')
    .update({ messages, proposals, updated_at: now })
    .eq('canvas_id', params.id).eq('user_id', user.id)
    .select('canvas_id').maybeSingle();
  if (updateError) throw error(503, 'Could not save private discussion');
  if (!existing) {
    const { error: insertError } = await locals.supabase.from('toolkit_canvas_conversations')
      .insert({ canvas_id: params.id, user_id: user.id, messages, proposals, updated_at: now });
    if (insertError?.code === '23505') {
      // Another same-user tab inserted it between UPDATE and INSERT.
      const { error: retryError } = await locals.supabase
        .from('toolkit_canvas_conversations')
        .update({ messages, proposals, updated_at: now })
        .eq('canvas_id', params.id).eq('user_id', user.id);
      if (retryError) throw error(503, 'Could not save private discussion');
    } else if (insertError) {
      throw error(503, 'Could not save private discussion');
    }
  }
  return json({ ok: true }, { headers });
};
