import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canManageSharedInventory } from '../../src/lib/server/authz/shared-data';

const file = (path: string) => readFileSync(path, 'utf8');
const migration = file('supabase/migrations/20261009000005_toolkit_shared_canvases_private_conversations.sql');
const boardList = file('src/routes/api/ai/canvas/+server.ts');
const board = file('src/routes/api/ai/canvas/[id]/+server.ts');
const discussion = file('src/routes/api/toolkit/conversations/[id]/+server.ts');
const workspace = file('src/routes/toolkit/canvas/+page.svelte');

describe('OMS-R06 shared canvas role contract', () => {
  it('grants identical management access only to the three requested roles', () => {
    for (const role of ['RD','Boss','HeadOfProduction']) {
      expect(canManageSharedInventory(role)).toBe(true);
    }
    for (const role of ['Operator','StationHead','admin','']) {
      expect(canManageSharedInventory(role)).toBe(false);
    }
    expect(boardList).toContain('requireToolkitManager(locals.user)');
    expect(board).toContain('requireToolkitManager(locals.user)');
    expect(discussion).toContain('requireToolkitManager(locals.user)');
  });
  it('makes historical and future canvas documents team-visible', () => {
    expect(migration).toContain('UPDATE public.canvas_documents SET shared = TRUE');
    expect(migration).toContain('ALTER COLUMN shared SET DEFAULT TRUE');
    expect(migration).toContain('toolkit_canvas_managers_read');
    expect(migration).toContain('toolkit_canvas_managers_update');
    expect(migration).toContain('toolkit_canvas_managers_delete');
    expect(migration).toContain('public.is_admin()');
    expect(boardList).toContain('shared: true');
    expect(boardList).not.toContain(".eq('user_id',");
  });
  it('removes stale permissive canvas policies before applying canonical role restrictions', () => {
    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain("tablename='canvas_documents'");
    expect(migration).toContain('DROP POLICY IF EXISTS');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
  });
  it('migrates and scrubs personal conversation data atomically before shared access', () => {
    const copy = migration.indexOf('INSERT INTO public.toolkit_canvas_conversations');
    const scrub = migration.indexOf('SET payload = public.toolkit_strip_private_canvas_payload(payload)');
    const share = migration.indexOf('toolkit_canvas_managers_read');
    expect(copy).toBeGreaterThan(0);
    expect(scrub).toBeGreaterThan(copy);
    expect(share).toBeGreaterThan(scrub);
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });
  it('archives embedded legacy ChatShape threads privately and strips shared snapshots', () => {
    expect(migration).toContain('public.toolkit_legacy_chat_threads(payload)');
    expect(migration).toContain("jsonb_set(clean_record, '{props,messages}', '[]'::jsonb, true)");
    expect(migration).toContain('toolkit_canvas_sanitize_insert');
    expect(migration).toContain('NEW.payload := public.toolkit_strip_private_canvas_payload(NEW.payload)');
    expect(discussion).toContain('legacyThreads: data?.node_threads');
    expect(workspace).toContain('Archived personal canvas chats');
    expect(discussion).not.toContain('.upsert(');
  });
  it('keeps every canvas discussion and proposal owner-only even for other managers', () => {
    expect(migration).toContain('toolkit_conversations_owner_read');
    expect(migration).toContain('user_id = auth.uid() AND public.is_admin()');
    expect(migration).toContain('PRIMARY KEY (canvas_id, user_id)');
    expect(discussion).toContain(".eq('user_id', user.id)");
    expect(discussion).toContain('user_id: user.id');
    expect(workspace).toContain('/api/toolkit/conversations/');
    expect(workspace).not.toContain('conversation: messages.slice(-24)');
    expect(workspace).toContain('const payload = { version: 1, snapshot: lastSnapshot }');
    expect(boardList).toContain('validateCanvasPayload');
    expect(board).toContain('validateCanvasPayload');
    const access = file('src/lib/server/toolkit/access.ts');
    expect(access).toContain("['conversation','conversations','messages','proposals']");
  });
  it('does not modify per-user chat session and message RLS', () => {
    const chat = file('src/routes/api/ai/sessions/+server.ts');
    expect(chat).toContain(".from('ai_chat_sessions')");
    expect(chat).toContain('locals.supabase');
    const sql = file('supabase/migrations/20260501100000_roles_stations_chat_attachments.sql');
    expect(sql).toContain('ai_sessions_owner');
    expect(sql).toContain('ai_messages_owner');
    expect(migration).not.toContain('ALTER TABLE public.ai_chat_sessions');
    expect(migration).not.toContain('ALTER TABLE public.ai_chat_messages');
  });
});

describe('OMS-R06 shared-board stability and interaction', () => {
  it('performs CAS saves under a database revision trigger', () => {
    expect(migration).toContain('NEW.revision := OLD.revision + 1');
    expect(migration).toContain('toolkit_canvas_revision_update');
    expect(board).toContain(".eq('revision', revision)");
    expect(board).toContain("status: 409");
    expect(workspace).toContain('revision: expectedRevision');
    expect(workspace).toContain('boardRevision = data.canvas.revision');
  });
  it('never overwrites on conflict and preserves a recovery path', () => {
    expect(workspace).toContain('if (response.status === 409)');
    expect(workspace).toContain('conflict = true');
    expect(workspace).toContain('async function saveRecoveryCopy()');
    expect(workspace).toContain('async function reloadLatest()');
    expect(workspace).toContain('A teammate saved a newer version');
    expect(workspace).toContain('Save a copy');
  });
  it('keeps private chat and shared board saves in independent flows', () => {
    expect(workspace).toContain('async function saveDiscussion()');
    expect(workspace).toContain('async function saveBoard()');
    expect(workspace).toContain('await saveDiscussion()');
    expect(workspace).toContain("markDiscussionDirty()");
    expect(workspace).toContain('history = messages.slice(-10)');
    expect(file('src/routes/api/toolkit/brainstorm/+server.ts')).toContain('recentPrivateConversation: history');
  });
  it('restores editor affordances without dropping old shapes', () => {
    expect(workspace).toContain('function undo()');
    expect(workspace).toContain('function redo()');
    expect(workspace).toContain('function zoomToContent()');
    expect(workspace).toContain('function deleteSelection()');
    const idea = file('src/lib/components/canvas/shapes/IdeaShape.tsx');
    expect(idea).toContain('Drag here to move this card');
    expect(idea).toContain('onKeyDown={stop}');
    const document = file('src/lib/components/canvas/shapes/DocumentShape.tsx');
    expect(document).toContain('Document notes');
    expect(document).toContain('edit({ content: e.target.value })');
    expect(file('src/lib/components/canvas/CanvasApp.tsx')).toContain('OrderDetailsShapeUtil');
  });
});
