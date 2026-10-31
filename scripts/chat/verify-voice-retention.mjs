#!/usr/bin/env node
// Isolated PostgreSQL and synthetic-media verification. Never opens Supabase,
// records a microphone, sends a real message, or deletes production storage.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const { PGlite } = await import(process.env.OMS_CHAT_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const temp = mkdtempSync(join(tmpdir(), 'oms-voice-verify-'));
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const rd = '33333333-3333-4333-8333-333333333333';
const inactive = '44444444-4444-4444-8444-444444444444';
const orderA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orderB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const hash = 'a'.repeat(64);

function table(source, name) {
  const result = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0];
  assert.ok(result, `Canonical ${name} definition missing`);
  return result;
}
async function as(actor, sql, params = [], role = 'authenticated') {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [actor || '', role]);
  await db.exec(role === 'service_role' ? 'SET ROLE service_role' : 'SET ROLE authenticated');
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
async function rpc(actor, name, params = [], role = 'authenticated') {
  return (await as(actor, `SELECT public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) AS value`, params, role)).rows[0].value;
}
async function fails(action, code) { await assert.rejects(action, (error) => { assert.equal(error.code, code); return true; }); }
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
async function clock(instant) {
  await db.exec('CREATE TABLE IF NOT EXISTS public.test_voice_clock(instant TIMESTAMPTZ)');
  await db.exec('DELETE FROM public.test_voice_clock');
  await db.query('INSERT INTO public.test_voice_clock VALUES ($1)', [instant]);
  await db.exec('CREATE OR REPLACE FUNCTION public.chat_voice_now() RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT instant FROM public.test_voice_clock $$');
}
const reserve = (actor, room = 'general', order = null, key = requestId, text = 'Caption remains') => rpc(null, 'chat_voice_reserve', [actor, room, order, key, 'audio/webm', 100, 1500, hash, text, null], 'service_role');
const commit = (actor, id) => rpc(null, 'chat_voice_commit', [actor, id], 'service_role');

try {
  const communications = read('supabase/migrations/20260204000008_communications.sql');
  const roles = read('supabase/migrations/20260501100000_roles_stations_chat_attachments.sql');
  // Core chat/profile/attachment tables are the exact checked-in declarations.
  // Only canonical order-access columns and Storage API metadata are projected
  // here; no live catalog, credentials or remote infrastructure is consulted.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::UUID $$;
    CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    ${table(read('supabase/migrations/20260204000002_user_profiles.sql'), 'profiles')}
    ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'Operator',ADD COLUMN avatar_url TEXT;
    CREATE TABLE public.draft_orders(id UUID PRIMARY KEY,created_by UUID REFERENCES public.profiles(id));
    CREATE TABLE public.order_assignees(draft_order_id UUID REFERENCES public.draft_orders(id),assignee_id UUID REFERENCES public.profiles(id));
    ${table(communications, 'chat_rooms')}
    ALTER TABLE public.chat_rooms ADD COLUMN kind TEXT DEFAULT 'channel',ADD COLUMN order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,ADD COLUMN archived_at TIMESTAMPTZ;
    ${table(communications, 'chat_messages')}
    ALTER TABLE public.chat_messages ADD COLUMN order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,ADD COLUMN content TEXT,
      ADD COLUMN attachments JSONB DEFAULT '[]',ADD COLUMN reply_to_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL;
    ${table(roles, 'chat_room_members')}
    ${table(roles, 'chat_attachments')}
    ${table(communications, 'notifications')}
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT NOT NULL,public BOOLEAN DEFAULT false,file_size_limit BIGINT,allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id TEXT REFERENCES storage.buckets(id),name TEXT);
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT SELECT ON public.profiles,public.chat_rooms,public.chat_room_members,public.draft_orders,public.order_assignees TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.chat_messages,public.chat_attachments,storage.objects TO authenticated;
    GRANT SELECT ON storage.objects TO anon;
    ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_messages ON public.chat_messages FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legacy_attachments ON public.chat_attachments FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legacy_storage ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);`);
  for (const [id, name, role, active] of [[a, 'Worker A', 'Operator', true], [b, 'Worker B', 'Operator', true], [rd, 'Root', 'RD', true], [inactive, 'Inactive', 'Operator', false]]) {
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
    await db.query('INSERT INTO public.profiles(id,username,display_name,role,is_active) VALUES($1,$2,$2,$3,$4)', [id, name, role, active]);
  }
  await db.query('INSERT INTO public.draft_orders VALUES($1,$2),($3,$4)', [orderA, a, orderB, b]);
  await db.query("INSERT INTO public.chat_rooms(id,name,kind,is_private,created_by,order_id) VALUES('general','General','channel',false,$1,NULL),('private','Private','group',true,$1,NULL),('montāža','Montāža','channel',false,$1,NULL),('order-a','Order','order',false,$1,$2)", [a, orderA]);
  await db.query("INSERT INTO public.chat_room_members(room_id,user_id) VALUES('private',$1)", [a]);
  const legacyMessage = await scalar("INSERT INTO public.chat_messages(room_id,user_id,text,content,created_at) VALUES('general',$1,'Legacy text stays','Legacy text stays','2025-11-30T10:00:00Z') RETURNING id AS value", [a]);
  const legacyVoice = await scalar("INSERT INTO public.chat_attachments(room_id,message_id,uploader_id,file_name,file_type,file_size,storage_path,attachment_kind,created_at) VALUES('general',$1,$2,'Old.ogg','audio/ogg',100,'legacy/audio.ogg','voice','2025-11-30T10:00:00Z') RETURNING id AS value", [legacyMessage, a]);
  await db.exec("INSERT INTO storage.buckets(id,name,public) VALUES('chat-attachments','chat-attachments',true); INSERT INTO storage.objects(bucket_id,name) VALUES('chat-attachments','legacy/audio.ogg')");
  await db.exec(read('supabase/migrations/20261031000004_chat_voice_retention.sql'));
  await clock('2026-01-31T12:34:56Z');
  assert.equal(await scalar("SELECT to_char(voice_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS value FROM public.chat_attachments WHERE id=$1", [legacyVoice]), '2026-02-28 10:00:00');
  assert.equal(await scalar("SELECT public AS value FROM storage.buckets WHERE id='chat-attachments'"), false);
  assert.equal((await as(a, 'SELECT * FROM storage.objects')).rows.length, 0);
  console.log('PASS: canonical migration installs, backfills legacy audio from original timestamps, and makes both audio storage paths private.');

  await fails(() => reserve(b, 'private'), '42501');
  await fails(() => reserve(b, 'order-a'), '42501');
  await fails(() => reserve(a, null, orderB), '42501');
  await fails(() => reserve(inactive), '42501');
  await fails(() => rpc(a, 'chat_voice_reserve', [a, 'general', null, requestId, 'audio/webm', 100, 1500, hash, '', null]), '42501');
  await fails(() => as(a, "INSERT INTO public.chat_attachments(room_id,uploader_id,file_name,file_type,file_size,storage_path) VALUES('general',$1,'fake.webm','application/octet-stream',100,'forged')", [a]), '42501');
  await fails(() => as(a, "INSERT INTO storage.objects(bucket_id,name) VALUES('chat-attachments',$1)", [`chat/general/${a}/fake.webm`]), '42501');
  const prepared = await reserve(a);
  assert.equal(prepared.voice_state, 'staged');
  assert.equal((await reserve(a)).id, prepared.id);
  await fails(() => reserve(a, 'montāža'), '40001');
  const saved = await commit(a, prepared.id);
  assert.equal((await commit(a, prepared.id)).message.id, saved.message.id);
  assert.equal(saved.attachment.message_id, saved.message.id);
  assert.equal(saved.attachment.voice_expires_at, '2026-04-30T12:34:56+00:00');
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.chat_messages WHERE id=$1', [saved.message.id]), 1);
  await rpc(b, 'chat_voice_playback', [prepared.id]);
  const privateVoice = await reserve(a, 'private', null, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  await commit(a, privateVoice.id);
  await fails(() => rpc(b, 'chat_voice_playback', [privateVoice.id]), '42501');
  await rpc(rd, 'chat_voice_playback', [privateVoice.id]);
  await fails(() => rpc(inactive, 'chat_voice_playback', [prepared.id]), '42501');
  assert.equal((await as(b, 'SELECT * FROM public.chat_attachments WHERE id=$1', [privateVoice.id])).rows.length, 0);
  const staged = await reserve(a, 'montāža', null, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  // A transaction started before expiry must not revive a path whose cleanup
  // was queued while it waited for a row lock; the persisted job is a fence.
  await db.query("INSERT INTO public.chat_voice_cleanup_jobs(attachment_id,storage_bucket,storage_path,reason) VALUES($1,$2,$3,'abandoned')", [staged.id, staged.storage_bucket, staged.storage_path]);
  await fails(() => reserve(a, 'montāža', null, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'P0003');
  await fails(() => commit(a, staged.id), 'P0003');
  const orderVoice = await reserve(a, null, orderA, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  await fails(() => rpc(b, 'chat_voice_playback', [orderVoice.id]), '42501');
  await db.query('INSERT INTO public.order_assignees VALUES($1,$2)', [orderA, b]);
  await commit(a, orderVoice.id);
  await commit(a, orderVoice.id);
  const notices = (await db.query('SELECT * FROM public.notifications WHERE source_id=$1', [orderA])).rows;
  assert.equal(notices.length, 1); assert.equal(notices[0].user_id, b);
  assert.equal(notices[0].notification_type, 'chat_message');
  assert.equal(notices[0].link, `/orders/${orderA}?tab=chat`);
  assert.equal(notices[0].message, 'Worker A sent a voice message.');
  await rpc(b, 'chat_voice_playback', [orderVoice.id]);
  console.log('PASS: active auth, room/private/order permissions, server-owned bytes/metadata, unicode rooms and idempotent atomic message binding.');

  const dm = await rpc(a, 'chat_create_dm', [b]);
  assert.equal((await rpc(b, 'chat_create_dm', [a])).id, dm.id);
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.chat_room_members WHERE room_id=$1', [dm.id]), 2);
  await fails(() => rpc(inactive, 'chat_create_dm', [a]), '42501');
  await fails(() => rpc(a, 'chat_create_dm', [inactive]), '22023');
  await fails(() => rpc(a, 'chat_create_dm', [a]), '22023');
  const wrongMessage = await scalar("INSERT INTO public.chat_messages(room_id,user_id,text,content) VALUES('private',$1,'Private text','Private text') RETURNING id AS value", [a]);
  await fails(() => rpc(null, 'chat_voice_store_file', [a, 'general', wrongMessage, 'file.pdf', 'application/pdf', 10, `files/${a}/safe.pdf`, 'file'], 'service_role'), '42501');
  const file = await rpc(null, 'chat_voice_store_file', [a, 'general', saved.message.id, 'file.pdf', 'application/pdf', 10, `files/${a}/safe.pdf`, 'file'], 'service_role');
  assert.equal(file.attachment_kind, 'file');
  console.log('PASS: ordinary-worker DM creation is scoped/idempotent; legacy file binding rejects a different room and keeps valid files.');

  const textBefore = await scalar('SELECT count(*)::INTEGER AS value FROM public.chat_messages');
  await clock('2026-04-30T12:34:55Z');
  await rpc(a, 'chat_voice_playback', [prepared.id]);
  await clock('2026-04-30T12:34:56Z');
  await fails(() => rpc(a, 'chat_voice_playback', [prepared.id]), 'P0003');
  await fails(() => rpc(a, 'chat_voice_claim_cleanup', [20]), '42501');
  const jobs = await rpc(null, 'chat_voice_claim_cleanup', [20], 'service_role');
  const job = jobs.find((item) => item.path === prepared.storage_path);
  assert.ok(job); assert.ok(!jobs.some((item) => item.path === file.storage_path));
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.chat_messages'), textBefore);
  assert.equal(await scalar('SELECT text AS value FROM public.chat_messages WHERE id=$1', [saved.message.id]), 'Caption remains');
  await fails(() => rpc(null, 'chat_voice_complete_cleanup', [job.jobId, a], 'service_role'), '40001');
  await clock('2026-04-30T12:41:00Z');
  const reclaimed = (await rpc(null, 'chat_voice_claim_cleanup', [20], 'service_role')).find((item) => item.jobId === job.jobId);
  assert.ok(reclaimed); assert.notEqual(reclaimed.leaseToken, job.leaseToken);
  await fails(() => rpc(null, 'chat_voice_complete_cleanup', [job.jobId, job.leaseToken], 'service_role'), '40001');
  assert.equal(await rpc(null, 'chat_voice_complete_cleanup', [reclaimed.jobId, reclaimed.leaseToken], 'service_role'), true);
  assert.equal(await rpc(null, 'chat_voice_complete_cleanup', [reclaimed.jobId, reclaimed.leaseToken], 'service_role'), true);
  assert.equal(await scalar('SELECT voice_state AS value FROM public.chat_attachments WHERE id=$1', [prepared.id]), 'deleted');
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.chat_messages'), textBefore);
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM storage.objects'), 1, 'SQL cleanup completion must never delete Storage object metadata');
  console.log('PASS: exact calendar-month deadline, immediate denial before cleanup, retry fencing and immutable message text/voice placeholders.');

  await db.query('DELETE FROM public.chat_messages WHERE id=$1', [legacyMessage]);
  assert.equal(await scalar("SELECT count(*)::INTEGER AS value FROM public.chat_voice_cleanup_jobs WHERE storage_path='legacy/audio.ogg'"), 1);
  assert.equal((await as(a, "SELECT * FROM storage.objects WHERE name='legacy/audio.ogg'")).rows.length, 0);
  assert.equal(await scalar('SELECT count(*)::INTEGER AS value FROM public.chat_attachments WHERE id=$1', [file.id]), 1);
  await clock('2028-02-29T09:00:00Z');
  const leap = await reserve(a, 'general', null, '99999999-9999-4999-8999-999999999999', 'Leap-day caption');
  const leapSaved = await commit(a, leap.id);
  assert.equal(leapSaved.attachment.voice_expires_at, '2028-05-29T09:00:00+00:00');
  console.log('PASS: cascaded explicit DB deletion retains a protected cleanup path; leap-day retention uses months, not90days.');

  writeFileSync(join(temp, 'voice-validation.mjs'), ts.transpileModule(read('src/lib/server/chat/voice-validation.ts'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText);
  const { validateVoiceSignature, probeVoice, containsAudioOnly } = await import(pathToFileURL(join(temp, 'voice-validation.mjs')).href);
  for (const [ext, mime, output] of [
    ['webm', 'audio/webm', ['-c:a', 'libopus', '-f', 'webm', '-live', '1']],
    ['ogg', 'audio/ogg', ['-c:a', 'libopus', '-f', 'ogg']],
    ['m4a', 'audio/mp4', ['-c:a', 'aac', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov']]
  ]) {
    const path = join(temp, `test.${ext}`);
    await promisify(execFile)('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-ac', '1', ...output, path], { timeout: 15_000 });
    const bytes = readFileSync(path);
    assert.equal(validateVoiceSignature(bytes, mime), mime);
    console.log(`Checking synthetic ${mime} recording.`);
    const duration = await probeVoice(bytes, mime);
    assert.ok(duration >= 1400 && duration <= 1700, `${mime} measured ${duration}`);
    assert.equal(await containsAudioOnly(bytes), true, `${mime} cannot bypass retention as an octet-stream file`);
  }
  console.log('PASS: real pipe-only ffprobe checks accept streamingWebM, OggOpus and fragmentedAAC/MP4, including unknown-container-duration packets.');
} finally {
  await db.close();
  rmSync(temp, { recursive: true, force: true });
}
