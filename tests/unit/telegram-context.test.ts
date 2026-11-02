import { describe,it } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeTelegramContextQuery,TELEGRAM_CONTEXT_SOURCES,boundTelegramContext } from '../../src/lib/server/notifications/telegram-context';
import { runTelegramAssistant } from '../../src/lib/server/notifications/telegram-assistant';
describe('Telegram live business context',()=>{
 it('validates sources, columns, operators and pagination without accepting SQL or identity',()=>{
  assert.deepEqual(normalizeTelegramContextQuery({source:'production_stages',filters:[{field:'state',op:'eq',value:'BLOCKED'}]}),{source:'production_stages',mode:'rows',filters:[{field:'state',op:'eq',value:'BLOCKED'}],groupBy:null,offset:0});
  for(const q of [{source:'vault'},{source:'orders',userId:'other'},{source:'orders',sql:'SELECT *'},{source:'materials',offset:-1},{source:'materials',offset:2001},{source:'materials',filters:[{field:'api_key',op:'eq',value:'x'}]},{source:'orders',mode:'summary'},{source:'orders',filters:[{field:'id',op:'delete',value:'x'}]}])assert.equal(normalizeTelegramContextQuery(q),null);
  assert.ok(Object.keys(TELEGRAM_CONTEXT_SOURCES).includes('work_entries'));
 });
 it('budgets whole rows with correct next-page offsets and marks omitted fields',()=>{
  const q=normalizeTelegramContextQuery({source:'orders',offset:20})!;
  const result=boundTelegramContext({rows:Array.from({length:20},(_,i)=>({id:String(i),notes:'x'.repeat(8000)})),truncated:false},q);
  assert.ok(JSON.stringify(result).length<12000);assert.equal(result.fieldsTruncated,true);
  assert.equal(result.truncated,true);assert.equal(result.nextOffset,20+result.rows.length);
 });
 it('discovers business datasets and reads current production data before answering',async()=>{
  let rounds=0;const reads:any[]=[];
  const result=await runTelegramAssistant({personalAiAllowed:true,question:'Which production stages are blocked?',locale:'en'},{
   authorize:async()=>true,lookup:async()=>({orders:[]}),
   readContext:async(q:any)=>{reads.push(q);return{source:q.source,rows:[{id:'stage-1',station:'CNC',state:'BLOCKED',blocked_reason:'Missing material'}]};},
   chat:async(messages:any)=>{
    rounds++;
    if(rounds===1)return{tool_calls:[{id:'sources',type:'function',function:{name:'list_oms_sources',arguments:'{}'}}]};
    if(rounds===2){assert.match(messages.at(-1).content,/production_stages/);return{tool_calls:[{id:'stages',type:'function',function:{name:'read_oms_context',arguments:'{"source":"production_stages","filters":[{"field":"state","op":"eq","value":"BLOCKED"}]}'}}]};}
    assert.match(messages.at(-1).content,/Missing material/);return{content:'CNC is blocked by missing material.'};
   }
  });
  assert.equal(result.status,'answered');assert.equal(reads.length,1);
 });
 it('rechecks authorization after a live context read and prevents further model calls after revocation',async()=>{
  let authorized=true,calls=0;
  const result=await runTelegramAssistant({personalAiAllowed:true,question:'stock'},{authorize:async()=>authorized,lookup:async()=>({orders:[]}),readContext:async()=>{authorized=false;return{rows:[{stock:100}]};},chat:async()=>{calls++;return{tool_calls:[{id:'stock',type:'function',function:{name:'read_oms_context',arguments:'{"source":"materials"}'}}]};}});
  assert.equal(result.status,'revoked');assert.equal(calls,1);
 });
});
