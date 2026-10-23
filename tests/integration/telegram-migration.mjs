/**
 * Executes the actual migration in an isolated PostgreSQL (PGlite) database.
 * No application credentials, production connection or Telegram calls.
 * Install PGlite outside the repository and set OMS_PGLITE_MODULE to its entry.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const { PGlite } = await import(process.env.OMS_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const rpc = async (name, args, types) => scalar(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}::${types[i]}`).join(',')}) AS value`, args);
const uid = randomUUID();
const secondUser = randomUUID();
const inactiveUser = randomUUID();
const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
const tokenC = 'c'.repeat(64);

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT current_setting('request.jwt.claim.role', true) $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_active boolean DEFAULT true);
    CREATE TABLE public.user_preferences (user_id uuid UNIQUE REFERENCES profiles(id), notifications_enabled boolean DEFAULT true);
    CREATE TABLE public.notification_preferences (user_id uuid REFERENCES profiles(id), notification_type text, enabled boolean DEFAULT true, UNIQUE(user_id, notification_type));
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES profiles(id),
      notification_type text NOT NULL, title text NOT NULL, message text, link text,
      source_type text, source_id uuid, is_read boolean DEFAULT false,
      is_dismissed boolean DEFAULT false, read_at timestamptz, created_at timestamptz DEFAULT now()
    );
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261022000001_telegram_notifications.sql', import.meta.url), 'utf8'));
  await db.query('INSERT INTO profiles(id,is_active) VALUES ($1,true),($2,true),($3,false)', [uid, secondUser, inactiveUser]);

  for (const role of ['anon', 'authenticated']) {
    check(await scalar(`SELECT has_table_privilege($1,'public.telegram_connections','SELECT') AS value`, [role]), false, `${role} cannot read chat IDs`);
    check(await scalar(`SELECT has_table_privilege($1,'public.telegram_link_tokens','SELECT') AS value`, [role]), false, `${role} cannot read linking hashes`);
    check(await scalar(`SELECT has_table_privilege($1,'public.telegram_deliveries','INSERT') AS value`, [role]), false, `${role} cannot enqueue phone messages`);
    check(await scalar(`SELECT has_table_privilege($1,'public.telegram_webhook_state','SELECT') AS value`, [role]), false, `${role} cannot read private chat ordering metadata`);
    check(await scalar(`SELECT has_function_privilege($1,'public.publish_telegram_notifications(jsonb)','EXECUTE') AS value`, [role]), false, `${role} cannot publish trusted notifications`);
    check(await scalar(`SELECT has_function_privilege($1,'public.process_telegram_update(bigint,timestamptz,text,text,text,text,text)','EXECUTE') AS value`, [role]), false, `${role} cannot forge a Telegram webhook command`);
  }
  check(await scalar(`SELECT bool_and(relrowsecurity) AS value FROM pg_class WHERE relname IN ('telegram_connections','telegram_link_tokens','telegram_deliveries','telegram_webhook_state')`), true, 'RLS enabled on all channel tables');
  await db.exec(`SET request.jwt.claim.role = 'authenticated'`);
  await assert.rejects(() => rpc('prepare_telegram_link', [uid, tokenA], ['uuid', 'text']), /Service role required/);
  checks += 1;
  await db.exec(`SET request.jwt.claim.role = 'service_role'`);
  await assert.rejects(() => rpc('prepare_telegram_link', [inactiveUser, tokenA], ['uuid', 'text']), /Active user required/);
  checks += 1;

  await rpc('prepare_telegram_link', [uid, tokenA], ['uuid', 'text']);
  check(await scalar(`SELECT expires_at > now() AND expires_at <= now() + interval '10 minutes' AS value FROM telegram_link_tokens WHERE user_id=$1`, [uid]), true, 'link expires in ten minutes');
  await assert.rejects(() => rpc('prepare_telegram_link', [uid, tokenC], ['uuid', 'text']), /link_rate_limited/);
  checks += 1;
  check(await rpc('consume_telegram_link', [tokenA, '111', '112', 'phone_one'], ['text', 'text', 'text', 'text']), false, 'chat identity mismatch rejected');
  check(await rpc('consume_telegram_link', [tokenA, '111', '111', 'phone_one'], ['text', 'text', 'text', 'text']), true, 'valid private chat links');
  check(await rpc('consume_telegram_link', [tokenA, '111', '111', 'phone_one'], ['text', 'text', 'text', 'text']), false, 'consumed link cannot replay');
  check(await scalar('SELECT enabled AS value FROM telegram_connections WHERE user_id=$1', [uid]), true, 'linking opts in explicitly');

  await rpc('prepare_telegram_link', [secondUser, tokenB], ['uuid', 'text']);
  check(await rpc('consume_telegram_link', [tokenB, '111', '111', null], ['text', 'text', 'text', 'text']), false, 'another OMS account cannot steal a chat');
  await db.query(`UPDATE telegram_link_tokens SET expires_at=now()-interval '1 second' WHERE user_id=$1`, [secondUser]);
  check(await rpc('consume_telegram_link', [tokenB, '222', '222', null], ['text', 'text', 'text', 'text']), false, 'expired link rejected');
  await db.query(`UPDATE telegram_link_tokens SET created_at=now()-interval '1 minute' WHERE user_id=$1`, [secondUser]);
  await rpc('prepare_telegram_link', [secondUser, tokenC], ['uuid', 'text']);
  check(await rpc('consume_telegram_link', [tokenC, '222', '222', null], ['text', 'text', 'text', 'text']), true, 'fresh token can link another private chat');

  const notification = (userId = uid, overrides = {}) => ({ id: randomUUID(), user_id: userId, notification_type: 'order_confirmed', title: 'Order confirmed', message: 'Ready for production', link: '/orders/fixture', source_type: 'order', source_id: randomUUID(), ...overrides });
  const publish = row => rpc('publish_telegram_notifications', [JSON.stringify([row])], ['jsonb']);
  const queueCount = async () => Number(await scalar('SELECT count(*)::int AS value FROM telegram_deliveries'));
  const first = notification();
  check(await publish(first), 1, 'trusted publication creates an in-app notification');
  check(await queueCount(), 1, 'trusted publication atomically enqueues one opted-in delivery');
  check(await publish(first), 0, 'repeated notification UUID is idempotent');
  check(await queueCount(), 1, 'publication retries do not duplicate the queue');
  await db.query('INSERT INTO notifications(user_id,notification_type,title) VALUES ($1,$2,$3)', [uid, 'order_confirmed', 'Untrusted generic insert']);
  check(await queueCount(), 1, 'ordinary notification insert never triggers phone delivery');

  await db.query('INSERT INTO notification_preferences(user_id,notification_type,enabled) VALUES ($1,$2,false)', [uid, 'order_confirmed']);
  await publish(notification());
  check(await queueCount(), 1, 'per-type opt-out prevents enqueue');
  await db.query('DELETE FROM notification_preferences WHERE user_id=$1', [uid]);
  await db.query('INSERT INTO user_preferences(user_id,notifications_enabled) VALUES ($1,false)', [uid]);
  await publish(notification());
  check(await queueCount(), 1, 'global notification opt-out prevents enqueue');
  await db.query('UPDATE user_preferences SET notifications_enabled=true WHERE user_id=$1', [uid]);

  const claimed = (await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows;
  check(claimed.length, 1, 'dispatcher claims pending item');
  check(claimed[0].attempts, 1, 'claim increments attempt count');
  check((await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows.length, 0, 'another claim cannot take an active lease');
  const delivery = claimed[0];
  const payload = await rpc('telegram_delivery_payload', [delivery.id, delivery.claim_token], ['uuid', 'uuid']);
  check(payload.chatId, '111', 'valid claim resolves only its linked private chat');
  check(await rpc('telegram_delivery_payload', [delivery.id, randomUUID()], ['uuid', 'uuid']), null, 'wrong lease cannot read delivery payload');
  check(await rpc('finish_telegram_delivery', [delivery.id, randomUUID(), 'sent'], ['uuid', 'uuid', 'text']), false, 'wrong lease cannot acknowledge');
  check(await rpc('finish_telegram_delivery', [delivery.id, delivery.claim_token, 'pending', new Date(Date.now() + 60_000).toISOString(), 'rate_limited'], ['uuid', 'uuid', 'text', 'timestamptz', 'text']), true, 'retryable failure is persisted');
  check((await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows.length, 0, 'backoff prevents immediate retry');
  await db.query(`UPDATE telegram_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1`, [delivery.id]);
  const retry = (await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows[0];
  check(retry.attempts, 2, 'retry has a new attempt');
  check(retry.claim_token === delivery.claim_token, false, 'retry gets a fresh lease');
  await db.query('UPDATE notifications SET is_read=true WHERE id=$1', [first.id]);
  check(await rpc('telegram_delivery_payload', [retry.id, retry.claim_token], ['uuid', 'uuid']), null, 'read state is rechecked immediately before send');
  await rpc('set_telegram_enabled', [uid, false], ['uuid', 'boolean']);
  check(await scalar('SELECT status AS value FROM telegram_deliveries WHERE id=$1', [retry.id]), 'cancelled', 'pause cancels processing delivery');
  check(await rpc('finish_telegram_delivery', [retry.id, retry.claim_token, 'sent'], ['uuid', 'uuid', 'text']), false, 'cancelled lease cannot be acknowledged');
  await publish(notification());
  check(await queueCount(), 1, 'paused connection does not enqueue');
  await rpc('set_telegram_enabled', [uid, true], ['uuid', 'boolean']);
  check((await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows.length, 0, 'resume does not replay cancelled alerts');

  await publish(notification());
  const blocked = (await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows[0];
  await rpc('finish_telegram_delivery', [blocked.id, blocked.claim_token, 'failed', null, 'blocked'], ['uuid', 'uuid', 'text', 'timestamptz', 'text']);
  check(await scalar('SELECT enabled AS value FROM telegram_connections WHERE user_id=$1', [uid]), false, 'blocked bot pauses only the matching connection');
  await rpc('set_telegram_enabled', [uid, true], ['uuid', 'boolean']);
  await publish(notification());
  await db.query(`UPDATE telegram_deliveries SET attempts=5 WHERE status='pending'`);
  check((await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows.length, 0, 'attempt ceiling enforced');
  check(await scalar(`SELECT status AS value FROM telegram_deliveries WHERE attempts=5`), 'failed', 'exhausted delivery remains inspectable');

  await publish(notification());
  await db.query(`UPDATE telegram_deliveries SET created_at=now()-interval '25 hours' WHERE status='pending'`);
  check((await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows.length, 0, 'old queued work expires');
  await publish(notification());
  const abandoned = (await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows[0];
  await db.query(`UPDATE telegram_deliveries SET locked_at=now()-interval '6 minutes' WHERE id=$1`, [abandoned.id]);
  const recovered = (await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows[0];
  check(recovered.id, abandoned.id, 'abandoned lease can be recovered');
  check(recovered.claim_token === abandoned.claim_token, false, 'recovered lease invalidates original worker');
  await rpc('prepare_telegram_link', [uid, tokenA], ['uuid', 'text']);
  await rpc('disconnect_telegram', [uid, null], ['uuid', 'text']);
  check(Number(await scalar('SELECT count(*)::int AS value FROM telegram_connections WHERE user_id=$1', [uid])), 0, 'disconnect removes private chat association');
  check(Number(await scalar('SELECT count(*)::int AS value FROM telegram_link_tokens WHERE user_id=$1', [uid])), 0, 'disconnect revokes pending links');
  check(await rpc('telegram_delivery_payload', [recovered.id, recovered.claim_token], ['uuid', 'uuid']), null, 'disconnect invalidates already claimed delivery');
  check(await scalar('SELECT status AS value FROM telegram_deliveries WHERE id=$1', [recovered.id]), 'cancelled', 'disconnect cancels processing delivery');

  const timestamp = secondsAgo => new Date(Date.now() - secondsAgo * 1000).toISOString();
  const command = (update, messageAt, action, token = null) => rpc('process_telegram_update', [update, messageAt, action, '111', '111', token, 'phone_one'], ['bigint', 'timestamptz', 'text', 'text', 'text', 'text', 'text']);
  await rpc('prepare_telegram_link', [uid, 'd'.repeat(64)], ['uuid', 'text']);
  check(await command(1000, timestamp(20), 'connect', 'd'.repeat(64)), true, 'webhook transaction consumes link and records ordering');
  const stopTime = timestamp(10);
  check(await command(1001, stopTime, 'disconnect'), true, 'fresh stop command disconnects');
  check(await scalar(`SELECT last_update_id::int AS value FROM telegram_webhook_state WHERE chat_id='111'`), 1001, 'ordering fence survives disconnect');
  await rpc('prepare_telegram_link', [uid, 'e'.repeat(64)], ['uuid', 'text']);
  const reconnectTime = timestamp(5);
  check(await command(1002, reconnectTime, 'connect', 'e'.repeat(64)), true, 'new link after stop connects normally');
  check(await command(1001, stopTime, 'disconnect'), false, 'retried old stop cannot unlink a newer connection');
  check(await command(1003, timestamp(30), 'disconnect'), false, 'older message cannot bypass ordering with a higher update ID');
  check(await command(1002, reconnectTime, 'disconnect'), false, 'duplicate update ID cannot change the applied action');
  check(await scalar('SELECT enabled AS value FROM telegram_connections WHERE user_id=$1', [uid]), true, 'reconnected account remains enabled after stale commands');
  check(await command(1004, timestamp(-600), 'disconnect'), false, 'implausibly future command does not advance ordering');
  await db.query(`UPDATE telegram_webhook_state SET last_message_at=now()-interval '8 days' WHERE chat_id='111'`);
  check(await command(1, timestamp(0), 'disconnect'), true, 'Telegram update ID reset after a week remains supported');
  console.log(`Telegram migration: ${checks} executable PostgreSQL checks passed.`);
} finally {
  await db.close();
}
