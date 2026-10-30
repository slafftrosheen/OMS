import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { runTelegramAssistant, TELEGRAM_ORDER_SEARCH_TOOL, TelegramToolsUnsupportedError } from '../../src/lib/server/notifications/telegram-assistant';
import { openRouterRequestBody, type OpenRouterClientConfig } from '../../src/lib/server/ai/openrouter';
import { responseLanguageInstruction } from '../../src/lib/server/ai/response-language';

const config:OpenRouterClientConfig={apiKey:'fixture',baseUrl:'https://openrouter.ai/api/v1',defaultModel:'fixture/text',visionModel:'fixture/vision',timeoutMs:120000};
const payload={personalAiAllowed:true,locale:'en',question:'Find PO-123',orders:[],events:[],notifications:[]};
const tool=(id:string)=>({id,type:'function',function:{name:'search_orders',arguments:'{"query":"PO-123"}'}});

describe('Telegram assistant to shared OpenRouter request contract',()=>{
  it('retains tool declarations while explicitly disabling new calls in the final result round',async()=>{
    const requests:any[]=[];let lookedUp=0;
    const result=await runTelegramAssistant(payload,{
      authorize:async()=>true,
      lookup:async()=>{lookedUp++;return {orders:[{id:'one',po_number:'PO-123'}]};},
      chat:async(messages,options)=>{
        requests.push(openRouterRequestBody({messages,...options},config));
        return requests.length<3?{tool_calls:[tool('call_'+requests.length)]}:{content:'PO-123 found.'};
      }
    });
    assert.equal(result.status,'answered');assert.equal(lookedUp,2);
    assert.deepEqual(requests[2].tools,[TELEGRAM_ORDER_SEARCH_TOOL]);
    assert.equal(requests[2].tool_choice,'none');
    assert.equal(requests[0].tool_choice,'auto');
    const calls=requests[2].messages.filter((m:any)=>m.role==='assistant').flatMap((m:any)=>m.tool_calls.map((c:any)=>c.id));
    assert.deepEqual(requests[2].messages.filter((m:any)=>m.role==='tool').map((m:any)=>m.tool_call_id),calls);
  });
  it('does not perform extra lookups if a provider ignores final tool_choice=none',async()=>{
    let rounds=0,lookups=0;
    const result=await runTelegramAssistant(payload,{authorize:async()=>true,lookup:async()=>{lookups++;return {orders:[]};},
      chat:async()=>({tool_calls:[tool('call_'+(++rounds))]})});
    assert.equal(result.status,'unavailable');assert.equal(lookups,2);
  });
  it('uses the same saved response-language instruction as the Canvas assistant',async()=>{
    let prompt='';
    const result=await runTelegramAssistant({...payload,locale:'ru-RU'},{authorize:async()=>true,lookup:async()=>({}),
      chat:async(messages)=>{prompt=messages[0].content;return {content:'Заказ найден.'};}});
    assert.equal(result.status,'answered');
    assert.ok(prompt.includes(responseLanguageInstruction('ru')));
  });
  it('preserves numeric priority in both snapshot and lookup results',async()=>{
    const requests:any[]=[];
    await runTelegramAssistant({...payload,orders:[{po_number:'PO-1',priority:9}]},{authorize:async()=>true,
      lookup:async()=>({orders:[{po_number:'PO-2',priority:0,secret:'do-not-send'}]}),
      chat:async(messages)=>{requests.push(structuredClone(messages));return requests.length===1?{tool_calls:[tool('q')]}:{content:'Found'};}});
    assert.equal(JSON.parse(requests[0][1].content).orders[0].priority,'9');
    const lookup=JSON.parse(requests[1].find((m:any)=>m.role==='tool').content);
    assert.equal(lookup.orders[0].priority,'0');assert.equal(lookup.orders[0].secret,undefined);
  });
  it('keeps text-only provider fallback free of tool declarations and tool choice',async()=>{
    const requests:any[]=[];
    const result=await runTelegramAssistant(payload,{authorize:async()=>true,lookup:async()=>{throw new Error('must not look up');},
      chat:async(messages,options)=>{requests.push(openRouterRequestBody({messages,...options},config));
        if(requests.length===1) throw new TelegramToolsUnsupportedError();return {content:'Snapshot only.'};}});
    assert.equal(result.status,'answered');assert.equal(requests[1].tools,undefined);assert.equal(requests[1].tool_choice,undefined);
  });
  it('does no provider or lookup work before personal consent',async()=>{
    let calls=0;const result=await runTelegramAssistant({...payload,personalAiAllowed:false},{authorize:async()=>{calls++;return true;},
      lookup:async()=>{calls++;return {};},chat:async()=>{calls++;return {};}});
    assert.equal(result.status,'consent_required');assert.equal(calls,0);
  });
  it('drops an answer if the active account loses permission during a provider call',async()=>{
    let authorized=true;
    const result=await runTelegramAssistant(payload,{authorize:async()=>authorized,lookup:async()=>({}),
      chat:async()=>{authorized=false;return {content:'private answer'};}});
    assert.equal(result.status,'revoked');
  });
  it('preserves ordinary tool callers default auto behavior',()=>{
    assert.equal(openRouterRequestBody({messages:[],tools:[TELEGRAM_ORDER_SEARCH_TOOL]},config).tool_choice,'auto');
    assert.equal(openRouterRequestBody({messages:[]},config).tool_choice,undefined);
  });
});
