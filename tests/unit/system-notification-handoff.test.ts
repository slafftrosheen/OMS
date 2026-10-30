import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { publishNotificationRows } from '../../src/lib/server/notifications/publish';

const notice={user_id:'recipient',notification_type:'order_confirmed',title:'Order confirmed',source_type:'order',source_id:'order'};
function storage() {
  const rows=new Map<string,any>();const calls:any[]=[];
  return {rows,calls,db:{from:(table:string)=>({
    insert:async(batch:any[])=>{calls.push({table,kind:'insert',batch});
      if(batch.some(r=>rows.has(r.id)))return {error:{code:'23505'}};
      for(const row of batch)rows.set(row.id,row);return {error:null};},
    upsert:async(batch:any[],options:any)=>{calls.push({table,kind:'upsert',batch,options});
      for(const row of batch)if(!rows.has(row.id))rows.set(row.id,row);return {error:null};}
  })}};
}

describe('Trusted notifications -> optional Telegram outbox handoff',()=>{
  it('uses the same IDs and does not report failure after an RPC commits but its response is lost',async()=>{
    const store=storage();let ids:string[]=[];
    const outbox:any={rpc:async(_name:string,args:any)=>{ids=args.p_notifications.map((r:any)=>r.id);
      for(const row of args.p_notifications)store.rows.set(row.id,{...row,title:'Committed title'});
      throw new Error('Response lost after commit');}};
    const result=await publishNotificationRows(store.db as any,[notice],outbox);
    assert.equal(result.error,null);assert.equal(store.rows.size,1);
    assert.deepEqual(store.calls[0].batch.map((r:any)=>r.id),ids);
    assert.deepEqual(store.calls[0].options,{onConflict:'id',ignoreDuplicates:true});
    assert.equal(store.rows.get(ids[0]).title,'Committed title');
  });
  it('preserves in-app notifications when a transient RPC failure did not commit',async()=>{
    const store=storage();const outbox:any={rpc:async()=>({error:{code:'503'}})};
    const result=await publishNotificationRows(store.db as any,[notice],outbox);
    assert.equal(result.error,null);assert.equal(store.rows.size,1);assert.equal(store.calls[0].kind,'upsert');
  });
  it('keeps ordinary inserts and a single missing-migration probe for the remainder of the fanout',async()=>{
    const store=storage();let probes=0;const outbox:any={rpc:async()=>{probes++;return {error:{code:'PGRST202'}};}};
    const result=await publishNotificationRows(store.db as any,Array.from({length:205},(_,i)=>({...notice,user_id:String(i)})),outbox);
    assert.equal(result.error,null);assert.equal(probes,1);assert.equal(store.rows.size,205);
    assert.deepEqual(store.calls.map(c=>[c.kind,c.batch.length]),[['insert',100],['insert',100],['insert',5]]);
  });
  it('still reports a genuine fallback storage failure without throwing into the business action',async()=>{
    const failure={code:'DATABASE_UNAVAILABLE'};
    const db:any={from:()=>({insert:async()=>({error:failure}),upsert:async()=>({error:failure})})};
    const result=await publishNotificationRows(db,[notice],{rpc:async()=>{throw new Error('RPC failed');}} as any);
    assert.equal(result.error,failure);
  });
});
