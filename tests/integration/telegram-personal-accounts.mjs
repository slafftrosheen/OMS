/** Execute the real Telegram migrations in isolated PostgreSQL (PGlite).
 * Vault's SQL API is a test fixture, not an encryption or concurrency claim.
 * Run with: OMS_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/integration/telegram-personal-accounts.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.OMS_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const scalar = async (sql, args=[]) => (await db.query(sql,args)).rows[0]?.value;
const rpc = (name,args=[],types=[]) => scalar(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}::${types[i]}`).join(',')}) AS value`,args);
const rd=randomUUID(),owner=randomUUID(),other=randomUUID(),pending=randomUUID();
const ownOrder=randomUUID(),hiddenOrder=randomUUID(),ownNote=randomUUID(),inventoryNote=randomUUID(),otherNote=randomUUID(),hiddenNote=randomUUID();
const token='123456:abcdefghijklmnopqrstuvwxyz_0123456789';
const options={connectionMode:'polling',pollingTimeoutSeconds:25,enabled:true,botUsername:'OMS_notify_bot',appUrl:'http://100.101.102.103:3000',commandsEnabled:true,aiEnabled:true,commands:['help','today','orders','order','notifications','read','pause','resume','ask'],notificationCategories:['ORDER','CHAT','INVENTORY','SYSTEM'],timezone:'Europe/Riga',batchSize:10,concurrency:2,maxAttempts:5,retryBaseSeconds:30,automaticDelivery:true,deliveryIntervalSeconds:30};
const save=(value=options)=>rpc('set_telegram_settings',[rd,value,token,'',''],['uuid','jsonb','text','text','text']);
const prefs=(user,categories=['ORDER','CHAT','INVENTORY','SYSTEM'],preview='full',ai=false)=>rpc('set_telegram_personal_preferences',[user,categories,preview,ai],['uuid','text[]','text','boolean']);
const status=(user)=>rpc('telegram_account_status',[user],['uuid']);
let update=100;
const command=async(name,arg='',chat='111')=>{
  await db.query(`UPDATE telegram_webhook_state SET last_command_at=now()-interval '2 seconds',last_ai_at=now()-interval '2 minutes' WHERE chat_id=$1`,[chat]);
  return rpc('process_telegram_bot_command',[++update,new Date().toISOString(),name,chat,chat,arg],['bigint','timestamptz','text','text','text','text']);
};
const claimReply=async(id)=>(await db.query('SELECT * FROM claim_telegram_bot_replies($1,2)',[id])).rows[0];
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
    CREATE FUNCTION vault.update_secret(secret_id uuid,new_secret text,new_name text,new_description text,key_id uuid) RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET secret=new_secret,name=new_name,description=new_description WHERE id=secret_id $$;`);
  for(const file of ['20261022000001_telegram_notifications.sql','20261022000002_telegram_rd_settings.sql','20261022000003_telegram_bidirectional.sql','20261023000001_telegram_polling.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  await db.query(`INSERT INTO profiles(id,role) VALUES($1,'RD'),($2,'Operator'),($3,'Operator'),($4,'Operator')`,[rd,owner,other,pending]);
  await db.query(`INSERT INTO telegram_connections(user_id,chat_id,telegram_user_id,enabled) VALUES($1,'222','222',true)`,[other]);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261023000002_telegram_personal_accounts.sql',import.meta.url),'utf8'));
  await db.exec(`SET request.jwt.claim.role='service_role'`);
  await save();
  check((await status(other)).connected,true,'existing connections are retained');
  check((await status(owner)).preferences.aiEnabled,false,'personal inference requires new explicit consent');
  for(const role of ['anon','authenticated']){
    check(await scalar(`SELECT has_table_privilege($1,'public.telegram_personal_preferences','SELECT') AS value`,[role]),false,'private preferences are not a general table API');
    for(const fn of ['telegram_account_status(uuid)','confirm_telegram_link(uuid,uuid)','set_telegram_personal_preferences(uuid,text[],text,boolean)','telegram_bot_search_orders(uuid,uuid,text,date,date,boolean)']) {
      check(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS value',[role,'public.'+fn]),false,role+' cannot call '+fn);
    }
  }
  for(const fn of ['disconnect_telegram_before_personal(uuid,text)','enqueue_telegram_notifications_before_personal(uuid[])','telegram_delivery_payload_before_personal(uuid,uuid)','process_telegram_bot_command_before_personal(bigint,timestamptz,text,text,text,text)','telegram_bot_reply_payload_before_personal(uuid,uuid)']) {
    check(await scalar('SELECT has_function_privilege(\'service_role\',$1,\'EXECUTE\') AS value',['public.'+fn]),false,'legacy helper is not directly callable');
  }
  await rpc('prepare_telegram_link',[owner,'a'.repeat(64)],['uuid','text']);
  check(await rpc('consume_telegram_link',['a'.repeat(64),'111','999','alice'],['text','text','text','text']),false,'different private sender rejected');
  check(await rpc('process_telegram_update',[1,new Date().toISOString(),'connect','111','111','a'.repeat(64),'alice'],['bigint','timestamptz','text','text','text','text','text']),true,'shared transport stages candidate');
  let own=await status(owner);const approval=own.pendingApproval.requestId;
  check(own.connected,false,'bearer link alone never activates account');
  check(own.pendingApproval.telegramUserId,'111','confirmation displays immutable numeric Telegram identity');
  check(await command('orders'),null,'unconfirmed identity cannot read orders');
  check(await rpc('confirm_telegram_link',[other,approval],['uuid','uuid']),false,'wrong OMS account cannot approve candidate');
  check(await rpc('consume_telegram_link',['a'.repeat(64),'333','333','attacker'],['text','text','text','text']),false,'candidate identity cannot be silently replaced');
  check(await rpc('confirm_telegram_link',[owner,approval],['uuid','uuid']),true,'same authenticated owner confirms exact candidate');
  check(await rpc('confirm_telegram_link',[owner,approval],['uuid','uuid']),false,'confirmation is single-use');
  own=await status(owner);check(own.connected,true,'confirmed link is usable');check(own.accountId,owner,'status is owner scoped');
  check(own.pendingApproval,null,'completed candidate removed');check(JSON.stringify(own).includes('token_hash'),false,'no link digest in public status');
  await rpc('prepare_telegram_link',[pending,'b'.repeat(64)],['uuid','text']);
  check(await rpc('consume_telegram_link',['b'.repeat(64),'111','111','alice'],['text','text','text','text']),false,'existing Telegram account cannot be stolen by another OMS account');
  await rpc('consume_telegram_link',['b'.repeat(64),'333','333','candidate'],['text','text','text','text']);
  const expiring=(await status(pending)).pendingApproval.requestId;
  await db.query(`UPDATE telegram_link_tokens SET expires_at=now()-interval '1 second',created_at=now()-interval '1 minute' WHERE user_id=$1`,[pending]);
  check(await rpc('confirm_telegram_link',[pending,expiring],['uuid','uuid']),false,'expired confirmation rejected');
  await rpc('prepare_telegram_link',[pending,'c'.repeat(64)],['uuid','text']);
  await rpc('consume_telegram_link',['c'.repeat(64),'333','333','candidate'],['text','text','text','text']);
  check(await rpc('disconnect_telegram',[null,'333'],['uuid','text']),true,'stop cancels pending handshake');
  check((await status(pending)).pendingApproval,null,'stopped candidate deleted');
  check(await rpc('consume_telegram_link',['c'.repeat(64),'333','333','candidate'],['text','text','text','text']),false,'stopped token cannot be replayed');
  await db.query(`INSERT INTO draft_orders(id,po_number,title,client,status,priority,due_date,created_by) VALUES
    ($1,'OWN-42','Workshop sign','Acme','CONFIRMED','HIGH','2026-10-23',$3),($2,'SECRET-99','Private draft','Private','DRAFT','NORMAL','2026-10-24',$4)`,[ownOrder,hiddenOrder,owner,other]);
  await db.query(`INSERT INTO notifications(id,user_id,notification_type,title,message,source_type,source_id) VALUES
    ($1,$5,'order_ready','Visible order','Confidential content','order',$7),
    ($2,$5,'low_stock','Stock','Stock details','inventory',NULL),
    ($3,$6,'order_ready','Other user notification','Private content','order',$7),
    ($4,$5,'order_ready','Now hidden order','Old event content','order',$8)`,[ownNote,inventoryNote,otherNote,hiddenNote,owner,other,ownOrder,hiddenOrder]);
  check(await rpc('telegram_notification_for_account',[otherNote,owner],['uuid','uuid']),false,'another user notification rejected');
  check(await rpc('telegram_notification_for_account',[hiddenNote,owner],['uuid','uuid']),false,'stale private order event rejected');
  await prefs(owner,['ORDER'],'private',false);
  await rpc('enqueue_telegram_notifications',[[ownNote,inventoryNote,otherNote,hiddenNote]],['uuid[]']);
  check(await scalar('SELECT count(*)::int AS value FROM telegram_deliveries WHERE user_id=$1',[owner]),1,'only selected owner categories enqueue');
  const deliveries=(await db.query('SELECT * FROM claim_telegram_deliveries(10)')).rows;
  const delivery=deliveries.find(row=>row.user_id===owner);
  const privatePayload=await rpc('telegram_delivery_payload',[delivery.id,delivery.claim_token],['uuid','uuid']);
  check(privatePayload.chatId,'111','notification uses owner chat only');
  check(privatePayload.notification.message,null,'private preview removes message');
  check(privatePayload.notification.title,'New OMS notification','private preview removes original title');
  check(JSON.stringify(privatePayload).includes('Confidential'),false,'no original body in returned preview');
  await prefs(owner,[],'full',false);
  check(await rpc('telegram_delivery_payload',[delivery.id,delivery.claim_token],['uuid','uuid']),null,'new preferences invalidate already claimed delivery');
  check(await scalar('SELECT status AS value FROM telegram_deliveries WHERE id=$1',[delivery.id]),'cancelled','filtered delivery cannot be revived');
  await prefs(owner,['ORDER'],'full',false);
  let replyId=await command('ask','Find OWN-42');let lease=await claimReply(replyId);
  let payload=await rpc('telegram_bot_reply_payload',[replyId,lease.claim_token],['uuid','uuid']);
  check(payload.payload.personalAiDisabled,true,'unconsented ask becomes local guidance');
  check(payload.payload.orders,undefined,'no account context retained for unconsented AI');
  check(payload.payload.question,undefined,'no unconsented question retained');
  await rpc('prepare_telegram_bot_reply',[replyId,lease.claim_token,'Enable personal AI in settings',[]],['uuid','uuid','text','jsonb']);
  payload=await rpc('telegram_bot_reply_payload',[replyId,lease.claim_token],['uuid','uuid']);
  check(payload.payload.personalAiDisabled,true,'consent provenance survives rendered reply storage');
  check(await rpc('telegram_bot_search_orders',[replyId,lease.claim_token,'OWN-42'],['uuid','uuid','text']),null,'denial reply cannot obtain lookup data');
  await prefs(owner,['ORDER'],'full',true);
  replyId=await command('ask','Find OWN-42');lease=await claimReply(replyId);
  check((await rpc('telegram_bot_reply_payload',[replyId,lease.claim_token],['uuid','uuid'])).payload.personalAiAllowed,true,'consented request marked by database');
  let search=await rpc('telegram_bot_search_orders',[replyId,lease.claim_token,'OWN-42'],['uuid','uuid','text']);
  check(search.orders.map(row=>row.po_number),['OWN-42'],'claim-scoped literal lookup finds accessible order');
  check((await rpc('telegram_bot_search_orders',[replyId,lease.claim_token,'SECRET-99'],['uuid','uuid','text'])).orders,[],'lookup never reveals another user private draft');
  check(await rpc('telegram_bot_search_orders',[replyId,randomUUID(),'OWN-42'],['uuid','uuid','text']),null,'wrong reply claim has no authority');
  await assert.rejects(()=>rpc('telegram_bot_search_orders',[replyId,lease.claim_token,'','2026-01-01','2026-10-01'],['uuid','uuid','text','date','date']),/Invalid search/);checks++;
  check((await scalar('SELECT order_ids AS value FROM telegram_bot_replies WHERE id=$1',[replyId])).includes(ownOrder),true,'lookup dependencies persisted before returning context');
  await db.query(`UPDATE draft_orders SET status='DRAFT',created_by=$2 WHERE id=$1`,[ownOrder,other]);
  check(await rpc('telegram_bot_reply_payload',[replyId,lease.claim_token],['uuid','uuid']),null,'revoked order cancels response after inference');
  await prefs(owner,['ORDER'],'full',false);
  check(await scalar('SELECT status AS value FROM telegram_bot_replies WHERE id=$1',[replyId]),'cancelled','personal AI opt-out cancels queued/active questions');
  check(await scalar('SELECT payload AS value FROM telegram_bot_replies WHERE id=$1',[replyId]),{},'opt-out clears question and prepared answer');
  await save({...options,enabled:false});
  check(await prefs(owner,['CHAT'],'private',false),true,'own preferences work while company bot disabled');
  check(await rpc('disconnect_telegram',[owner],['uuid']),true,'own disconnect works while company bot disabled');
  check((await status(owner)).connected,false,'disconnect removes linkage');
  await db.query('UPDATE profiles SET is_active=false WHERE id=$1',[owner]);
  check(await status(owner),null,'inactive account has no status or preferences');
  await db.exec(`SET request.jwt.claim.role='authenticated'`);
  await assert.rejects(()=>status(other),/Service role required/);checks++;
  console.log(`${checks} Telegram account/link/privacy/AI SQL assertions passed`);
} finally { await db.close(); }
