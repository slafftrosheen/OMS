/** Run against isolated PGlite, never the production database. Vault is a contract stub. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
const { PGlite } = await import(process.env.OMS_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const rpc = (name, args = [], types = []) => scalar(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}::${types[i]}`).join(',')}) AS value`, args);
const rd = randomUUID(), owner = randomUUID(), note = randomUUID();
let token = '123456:abcdefghijklmnopqrstuvwxyz_0123456789';
let options = { enabled: true, connectionMode: 'polling', pollingTimeoutSeconds: 25, botUsername: 'OMS_notify_bot', appUrl: '',
  commandsEnabled: true, aiEnabled: false, commands: ['help', 'today', 'orders', 'order', 'notifications', 'read', 'pause', 'resume'],
  notificationCategories: ['ORDER', 'CHAT', 'INVENTORY', 'SYSTEM'], timezone: 'Europe/Riga', batchSize: 10, concurrency: 2,
  maxAttempts: 5, retryBaseSeconds: 30, automaticDelivery: true, deliveryIntervalSeconds: 30 };
const save = async () => {
  await rpc('set_telegram_settings', [rd, options, token, '', ''], ['uuid', 'jsonb', 'text', 'text', 'text']);
  // Ensure distinct generations even on an unusually fast test database.
  await db.exec("UPDATE telegram_system_settings SET updated_at=clock_timestamp()+interval '1 second'");
};
const claim = async (mode = options.connectionMode) => {
  const settings = await rpc('get_telegram_settings');
  return rpc('claim_telegram_receiver', [settings.revision, createHash('sha256').update(token).digest('hex'), mode, randomUUID()], ['timestamptz', 'text', 'text', 'uuid']);
};
const release = lease => rpc('release_telegram_receiver', [lease.token], ['uuid']);
const processUpdate = (lease, id, action = null, command = null, argument = '') => rpc('process_telegram_polled_update',
  [lease.token, id, new Date().toISOString(), action, command, '111', '111', argument, null, null],
  ['uuid', 'bigint', 'timestamptz', 'text', 'text', 'text', 'text', 'text', 'text', 'text']);
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY,is_active boolean DEFAULT true,role text);
    CREATE TABLE user_preferences(user_id uuid UNIQUE REFERENCES profiles(id),locale text DEFAULT 'en',notifications_enabled boolean DEFAULT true);
    CREATE TABLE notification_preferences(user_id uuid REFERENCES profiles(id),notification_type text,enabled boolean DEFAULT true,UNIQUE(user_id,notification_type));
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),notification_type text NOT NULL,title text NOT NULL,message text,link text,source_type text,source_id uuid,is_read boolean DEFAULT false,is_dismissed boolean DEFAULT false,read_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE draft_orders(id uuid PRIMARY KEY,po_number text,title text,client text,status text,priority text,due_date date,loading_date date,created_by uuid REFERENCES profiles(id));
    CREATE TABLE calendar_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text,date date,title text,note text,created_at timestamptz DEFAULT now());
    CREATE SCHEMA vault; CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text UNIQUE,secret text,description text);
    CREATE VIEW vault.decrypted_secrets AS SELECT id,name,secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(new_secret text,new_name text,new_description text,key_id uuid) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets(secret,name,description) VALUES(new_secret,new_name,new_description) RETURNING id $$;
    CREATE FUNCTION vault.update_secret(secret_id uuid,new_secret text,new_name text,new_description text,key_id uuid) RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET secret=new_secret,name=new_name,description=new_description WHERE id=secret_id $$;
  `);
  for (const file of ['20261022000001_telegram_notifications.sql', '20261022000002_telegram_rd_settings.sql', '20261022000003_telegram_bidirectional.sql', '20261023000001_telegram_polling.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8'));
  }
  for (const role of ['anon', 'authenticated']) {
    check(await scalar("SELECT has_table_privilege($1,'public.telegram_receiver_state','SELECT') AS value", [role]), false, 'receiver state is service-only');
    for (const signature of ['claim_telegram_receiver(timestamptz,text,text,uuid)', 'renew_telegram_receiver(uuid)', 'release_telegram_receiver(uuid)', 'telegram_receiver_status()', 'process_telegram_polled_update(uuid,bigint,timestamptz,text,text,text,text,text,text,text)']) {
      check(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE') AS value", [role, 'public.' + signature]), false, role + ' cannot call ' + signature);
    }
  }
  await db.exec("SET request.jwt.claim.role='service_role'");
  await db.query("INSERT INTO profiles(id,role) VALUES($1,'RD'),($2,'Operator')", [rd, owner]);
  await db.query("INSERT INTO notifications(id,user_id,notification_type,title) VALUES($1,$2,'order_confirmed','Private notification')", [note, owner]);
  await save();
  await rpc('prepare_telegram_link', [owner, 'a'.repeat(64)], ['uuid', 'text']);
  await rpc('consume_telegram_link', ['a'.repeat(64), '111', '111', 'operator'], ['text', 'text', 'text', 'text']);
  let lease = await claim();
  check(lease.offset, null, 'new bot starts without offset');
  check(await claim(), null, 'second receiver cannot steal live lease');
  check(await rpc('release_telegram_receiver', [randomUUID()], ['uuid']), false, 'foreign owner cannot release lease');
  check(await rpc('renew_telegram_receiver', [lease.token], ['uuid']), true, 'owner can renew');
  check(await rpc('prepare_telegram_receiver', [lease.token], ['uuid']), true, 'provider preparation persisted');
  await db.exec(`CREATE FUNCTION fail_receiver_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.next_offset IS DISTINCT FROM OLD.next_offset THEN RAISE EXCEPTION 'checkpoint failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER receiver_checkpoint_failure BEFORE UPDATE ON telegram_receiver_state FOR EACH ROW EXECUTE FUNCTION fail_receiver_checkpoint();`);
  await assert.rejects(() => processUpdate(lease, 101, 'command', 'read', note), /checkpoint failure/); checks++;
  check(await scalar('SELECT is_read AS value FROM notifications WHERE id=$1', [note]), false, 'command mutation rolls back with cursor failure');
  check(await scalar('SELECT count(*)::int AS value FROM telegram_bot_replies'), 0, 'reply enqueue rolls back with cursor failure');
  check(await scalar('SELECT next_offset AS value FROM telegram_receiver_state'), null, 'failed update remains unacknowledged');
  await db.exec('DROP TRIGGER receiver_checkpoint_failure ON telegram_receiver_state');
  check((await processUpdate(lease, 101, 'command', 'read', note)).accepted, true, 'valid command and cursor commit');
  check(await scalar('SELECT is_read AS value FROM notifications WHERE id=$1', [note]), true, 'own notification changed');
  await processUpdate(lease, 101, 'command', 'read', note);
  check(await scalar('SELECT count(*)::int AS value FROM telegram_bot_replies'), 1, 'replayed command does not duplicate reply');
  check((await processUpdate(lease, 102)).nextOffset, 103, 'unsupported update advances only cursor');
  await release(lease); lease = await claim();
  check(lease.offset, 103, 'restart uses durable cursor'); check(lease.prepared, true, 'restart does not repeatedly delete webhook');
  options = { ...options, connectionMode: 'webhook' }; await save();
  check(await claim(), null, 'mode switch waits for old network request owner');
  check(await rpc('renew_telegram_receiver', [lease.token], ['uuid']), false, 'old settings lose heartbeat');
  check((await processUpdate(lease, 103)).accepted, false, 'stale transport cannot mutate');
  await release(lease); lease = await claim();
  check(!!lease, true, 'webhook control takes lease after old poll releases');
  await release(lease);
  options = { ...options, connectionMode: 'polling' }; await save(); lease = await claim();
  check(lease.offset, 103, 'mode switch preserves bot cursor'); check(lease.prepared, false, 'new generation requires provider reconciliation');
  await rpc('record_telegram_receiver_poll', [lease.token, 'rate_limited', 120], ['uuid', 'text', 'integer']);
  await release(lease);
  check(await claim(), null, 'backoff survives loop/process restart');
  check((await rpc('telegram_receiver_status')).state, 'backoff', 'operator sees backoff');
  await save(); lease = await claim(); check(!!lease, true, 'explicit settings save permits reconciliation retry');
  await release(lease);
  token = '123456:' + 'z'.repeat(30); await save(); lease = await claim();
  check(lease.offset, 103, 'same bot credential rotation preserves cursor');
  check(await scalar('SELECT count(*)::int AS value FROM telegram_webhook_state'), 1, 'same bot retains replay protection');
  await release(lease);
  await db.exec("UPDATE telegram_receiver_state SET last_update_at=now()-interval '8 days'");
  lease = await claim(); check(lease.offset, null, 'idle week permits Telegram update-ID randomization'); await release(lease);
  token = '987654:' + 'y'.repeat(30); await save(); lease = await claim();
  check(lease.offset, null, 'different bot never inherits old cursor');
  check(await scalar('SELECT count(*)::int AS value FROM telegram_webhook_state'), 0, 'different bot clears obsolete per-chat update IDs'); await release(lease);
  options = { ...options, enabled: false }; await save();
  check(await claim(), null, 'master disable prevents new polling');
  check((await rpc('telegram_receiver_status')).state, 'disabled', 'disabled health is explicit');
  const health = await rpc('telegram_receiver_status');
  check(Object.keys(health).sort(), ['available', 'lastError', 'lastPollAt', 'lastUpdateAt', 'retryAt', 'state'].sort(), 'health contains no identities, tokens or raw updates');
  console.log(`${checks} Telegram polling SQL checks passed`);
} finally { await db.close(); }
