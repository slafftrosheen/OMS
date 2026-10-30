import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { dispatchTelegramBotReplies } from '../../src/lib/server/notifications/telegram-bot';
import { DEFAULT_TELEGRAM_OPTIONS } from '../../src/lib/notifications/telegram-options';
import type { TelegramConfig } from '../../src/lib/server/notifications/telegram';
const config:TelegramConfig={botToken:'123456:abcdefghijklmnopqrstuvwxyz',botUsername:'OMS_notify_bot',webhookSecret:'s'.repeat(32),deliverySecret:'d'.repeat(32),appUrl:'http://100.101.102.103:3000',options:{...DEFAULT_TELEGRAM_OPTIONS,enabled:true,aiEnabled:true}};
function fixture(consent=true){
 const state:any={status:'pending',attempts:0,valid:true,payload:{kind:'ask',locale:'en',personalAiAllowed:consent,personalAiDisabled:!consent,question:'Find PO-42',orders:[]},lookups:[],sent:[],prepares:0};
 const db:any={rpc:(name:string,args:any)=>{
   let data:any;
   if(name==='get_telegram_settings')data=null;
   else if(name==='claim_telegram_bot_replies')data=state.status==='pending'?[{id:'reply-owner',claim_token:'live-lease',attempts:++state.attempts}]:[];
   else if(name==='telegram_bot_reply_payload')data=state.valid?{chatId:'111',payload:state.payload}:null;
   else if(name==='telegram_bot_search_orders'){state.lookups.push(args);data={orders:[{id:'order-visible',po_number:'PO-42',status:'CONFIRMED'}],truncated:false};}
   else if(name==='prepare_telegram_bot_reply'){state.prepares++;state.payload={kind:'ask',locale:'en',personalAiAllowed:consent,personalAiDisabled:!consent,rendered:args.p_text,keyboard:args.p_keyboard};data=true;}
   else if(name==='finish_telegram_bot_reply'){state.status=args.p_status;data=true;}
   else throw Error('Unexpected RPC '+name);
   const promise:any=Promise.resolve({data,error:null});promise.abortSignal=(signal:AbortSignal)=>{assert.ok(signal instanceof AbortSignal);return promise;};return promise;
 }};
 const fetcher:typeof fetch=async(_url,init)=>{state.sent.push(JSON.parse(String(init?.body)));return Response.json({ok:true,result:{message_id:42}});};
 return {state,db,fetcher};
}
describe('Telegram assistant delivery adapter',()=>{
 it('binds lookups to the current reply lease and sends only to its account chat',async()=>{
  const {state,db,fetcher}=fixture();let calls=0;
  await dispatchTelegramBotReplies(config,db,{fetcher,chat:async()=>++calls===1?{tool_calls:[{id:'lookup1',type:'function',function:{name:'search_orders',arguments:'{"query":"PO-42"}'}}]}:{content:'PO-42 is confirmed.'}});
  assert.equal(state.status,'sent');assert.equal(state.prepares,1);assert.equal(state.sent[0].chat_id,'111');
  assert.deepEqual(state.lookups,[{p_id:'reply-owner',p_claim_token:'live-lease',p_query:'PO-42',p_due_from:null,p_due_until:null,p_include_closed:false}]);
  assert.equal(state.payload.question,undefined);assert.equal(state.payload.personalAiAllowed,true);
 });
 it('delivers local opt-in guidance without any inference or lookup',async()=>{
  const {state,db,fetcher}=fixture(false);let calls=0;
  await dispatchTelegramBotReplies(config,db,{fetcher,chat:async()=>{calls++;return{content:'bad'};}});
  assert.equal(calls,0);assert.equal(state.lookups.length,0);assert.equal(state.status,'sent');assert.match(state.sent[0].text,/AI answers are off/);
 });
 it('cancels a response if account access disappears during a provider response',async()=>{
  const {state,db,fetcher}=fixture();
  await dispatchTelegramBotReplies(config,db,{fetcher,chat:async()=>{state.valid=false;return{content:'Should not leave server'};}});
  assert.equal(state.status,'cancelled');assert.equal(state.sent.length,0);assert.equal(state.prepares,0);
 });
 it('reuses a prepared answer on Telegram retry instead of repeating provider lookups',async()=>{
  const {state,db,fetcher}=fixture();let calls=0;
  const chat=async()=>{calls++;return{content:'PO-42 is confirmed.'};};
  await dispatchTelegramBotReplies(config,db,{chat,fetcher:async()=>Response.json({ok:false,error_code:429,parameters:{retry_after:1}},{status:429})});
  assert.equal(state.status,'pending');assert.equal(calls,1);
  await dispatchTelegramBotReplies(config,db,{chat,fetcher});
  assert.equal(state.status,'sent');assert.equal(calls,1);assert.equal(state.prepares,1);
 });
});
