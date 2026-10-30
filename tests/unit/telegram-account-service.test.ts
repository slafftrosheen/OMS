import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { readTelegramAccount, confirmTelegramAccount, saveTelegramPreferences, readTelegramAccountBody, TelegramAccountError } from '../../src/lib/server/notifications/telegram-account-service';
import { defaultTelegramPreferences } from '../../src/lib/notifications/telegram-account';
const owner='65f74cdc-7d2a-4776-8a79-0d0c2e64fa05';
const requestId='568fcf10-8932-4135-a9da-b3282c76dfe1';
const config={botUsername:'test_bot',options:{aiEnabled:true,commandsEnabled:true,commands:['ask']}};
const data={accountId:owner,connected:true,enabled:true,username:'alice',telegramUserId:'111',linkedAt:'2026-10-23T09:00:00Z',pendingUntil:null,pendingApproval:null,preferences:defaultTelegramPreferences()};
function database(result:any) {
 const calls:any[]=[];
 return { calls, rpc:async(name:string,args:any)=>{calls.push([name,args]);return result;} };
}
describe('Telegram personal service',()=>{
 it('reads only the authenticated account and omits arbitrary database fields',async()=>{
  const db=database({data:{...data,botToken:'must-not-leak'},error:null});
  const status=await readTelegramAccount(config,db,owner);
  assert.deepEqual(db.calls,[['telegram_account_status',{p_user_id:owner}]]);
  assert.equal(status.accountId,owner); assert.equal(status.aiAvailable,true);
  assert.equal((status as any).botToken,undefined);
 });
 it('fails closed if the database responds with another account',async()=>{
  const status=await readTelegramAccount(config,database({data:{...data,accountId:'other'},error:null}),owner);
  assert.equal(status.available,false); assert.equal(status.connected,false);
 });
 it('keeps own account management available when the company bot is disabled',async()=>{
  const status=await readTelegramAccount(null,database({data,error:null}),owner);
  assert.equal(status.available,true); assert.equal(status.configured,false); assert.equal(status.connected,true);
  assert.equal(status.aiAvailable,false);
 });
 it('never fabricates success or consent on malformed or missing database state',async()=>{
  for(const result of [{data:null,error:null},{data,error:{code:'42P01'}},{data:{...data,preferences:{aiEnabled:true}},error:null}]){
   const status=await readTelegramAccount(config,database(result),owner);
   assert.equal(status.available,false); assert.equal(status.preferences,undefined);
  }
 });
 it('confirms precisely the request for the session owner',async()=>{
  const db=database({data:true,error:null}); await confirmTelegramAccount(db,owner,requestId);
  assert.deepEqual(db.calls,[['confirm_telegram_link',{p_user_id:owner,p_request_id:requestId}]]);
 });
 it('surfaces stale and already-used confirmations without binding an account',async()=>{
  await assert.rejects(()=>confirmTelegramAccount(database({data:false,error:null}),owner,requestId),(e:any)=>e instanceof TelegramAccountError && e.code==='confirmation_expired' && e.status===409);
 });
 it('writes preferences with a server-bound account, not an identity in the payload',async()=>{
  const db=database({data:true,error:null}); const preferences=defaultTelegramPreferences();
  await saveTelegramPreferences(db,owner,preferences);
  assert.deepEqual(db.calls,[['set_telegram_personal_preferences',{p_user_id:owner,p_categories:preferences.notificationCategories,p_preview_mode:'full',p_ai_enabled:false}]]);
 });
 it('bounds streaming request bodies even without Content-Length',async()=>{
  const request=new Request('https://oms.test/api',{method:'POST',body:JSON.stringify({action:'connect'})});
  assert.deepEqual(await readTelegramAccountBody(request),{action:'connect'});
  await assert.rejects(()=>readTelegramAccountBody(new Request('https://oms.test/api',{method:'POST',body:'x'.repeat(9000)})),(e:any)=>e.status===413);
  await assert.rejects(()=>readTelegramAccountBody(new Request('https://oms.test/api',{method:'POST',body:'not-json'})),(e:any)=>e.status===400);
 });
});
