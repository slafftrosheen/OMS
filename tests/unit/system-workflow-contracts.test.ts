import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { buildCalendarDaySummary, normalizeCalendarOrder, isOutstandingOrder } from '../../src/lib/calendar/day-summary';
import { buildOrderBadges, isTerminalOrderStatus, lifecycleBadge } from '../../src/lib/badges/catalog';
import { normalizeNotification } from '../../src/lib/notifications/notification-model';
import * as notifications from '../../src/routes/api/notifications/+server';
import * as preferences from '../../src/routes/api/notifications/preferences/+server';

const userId='10000000-0000-0000-0000-000000000001';
const otherId='10000000-0000-0000-0000-000000000002';
const noteId='20000000-0000-0000-0000-000000000001';
const note={id:noteId,user_id:userId,notification_type:'order_confirmed',title:'Ready',message:'PO-12',
  source_type:'order',source_id:'30000000-0000-0000-0000-000000000001',link:'/orders/PO-12',
  is_read:true,is_dismissed:false,created_at:'2026-10-23T08:00:00Z',read_at:'2026-10-23T08:10:00Z'};

/** Request-scoped query fixture: records actual columns, owner predicates and writes.
 * It deliberately does not supply RLS as a substitute for the route's authorization. */
function fixture({active=true, signedIn=true, preferenceRows=[] as any[], notes=[{...note}] }={}) {
  const calls:any[]=[];
  const db={from(table:string) {
    const call:any={table,mode:'select',filters:[],payload:null,columns:'*',limit:null,single:false};calls.push(call);
    const query:any={
      select(columns='*'){call.columns=columns;return query;},
      eq(key:string,value:unknown){call.filters.push([key,value]);return query;},
      in(key:string,value:unknown){call.filters.push([key,value]);return query;},
      order(){return query;},limit(n:number){call.limit=n;return query;},
      insert(payload:any){call.mode='insert';call.payload=payload;return query;},
      update(payload:any){call.mode='update';call.payload=payload;return query;},
      upsert(payload:any,options:any){call.mode='upsert';call.payload=payload;call.options=options;return query;},
      single(){call.single=true;return query;},maybeSingle(){call.single=true;return query;},
      then(resolve:any,reject:any) {
        let data:any;
        if(table==='profiles') data={id:userId,is_active:active};
        else if(table==='notifications') {
          if(call.mode==='insert') data=[{...note,...call.payload}];
          else data=notes.filter(n=>call.filters.every(([key,val]:any)=>Array.isArray(val)?val.includes(n[key as keyof typeof n]):n[key as keyof typeof n]===val));
        } else if(table==='notification_preferences') data=['insert','upsert'].includes(call.mode)
          ? (Array.isArray(call.payload)?call.payload:[call.payload]) : preferenceRows;
        else throw new Error('Unexpected table '+table);
        if(call.single && Array.isArray(data)) {
          if(data.length!==1) return Promise.resolve({data:null,error:{code:'PGRST116'}}).then(resolve,reject);
          data=data[0];
        }
        return Promise.resolve({data,error:null}).then(resolve,reject);
      }
    };return query;
  }};
  const locals:any={user:signedIn?{id:userId,role:'Operator'}:null,supabase:db,
    getSession:async()=>signedIn?{user:{id:userId}}:null};
  return {locals,calls};
}
async function call(handler:any, f:ReturnType<typeof fixture>, method='GET', body?:unknown, search='') {
  const url=new URL('http://oms.internal/api/notifications'+search);
  const request=new Request(url,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  try{return await handler({locals:f.locals,request,url});}
  catch(e:any){if(e.status) return Response.json({error:e.message},{status:e.status});throw e;}
}

describe('Order lifecycle contract across lists and calendars',()=>{
  for(const status of ['CANCELED',' cancelled ',' completed ','done','DISPATCHED','ARCHIVED','REJECTED','VOIDED']) {
    it(`does not show an outstanding calendar deadline for ${JSON.stringify(status)}`,()=>{
      const row={id:'order-1',status,due_date:'2026-10-20',loading_date:'2026-10-20',priority:9};
      assert.equal(isTerminalOrderStatus(status),true);
      assert.equal(buildOrderBadges(row,'2026-10-23').some(b=>b.id==='overdue'),false);
      const order=normalizeCalendarOrder(row)!;
      assert.equal(isOutstandingOrder(order),false);
      assert.equal(buildCalendarDaySummary('2026-10-20',{orders:[order],today:'2026-10-23'}).badges.some(b=>b.kind==='overdue'),false);
    });
  }
  it('uses legacy DONE only when the authoritative status is absent',()=>{
    for(const row of [{id:'x',badges:['DONE']},{id:'x',badges:['DONE'],status:'IN_PRODUCTION'}]) {
      const input={...row,due_date:'2026-10-20'};
      const badges=buildOrderBadges(input,'2026-10-23');
      const outstanding=isOutstandingOrder(normalizeCalendarOrder(input)!);
      assert.equal(outstanding,badges.some(b=>b.id==='overdue'));
    }
  });
  it('excludes cancelled orders from loading references regardless of alias',()=>{
    const orders=[normalizeCalendarOrder({id:'x',po_number:'PO-1',status:' canceled ',loading_date:'2026-10-23'})!];
    const summary=buildCalendarDaySummary('2026-10-23',{orders,today:'2026-10-23',events:[
      {id:'load',kind:'loading',date:'2026-10-23',createdAt:'',poList:['x','PO-1']}
    ]});
    assert.equal(summary.loadingOrders.length,0);
    assert.equal(summary.badges.find(b=>b.kind==='loading')?.count,0);
  });
  it('retains unknown states visibly rather than pretending they are completed',()=>{
    assert.equal(lifecycleBadge('future_state')?.id,'unknown');
    assert.equal(isTerminalOrderStatus('future_state'),false);
    assert.equal(isOutstandingOrder(normalizeCalendarOrder({id:'x',status:'future_state'})!),true);
  });
});

describe('Notification HTTP to realtime/view-model contract',()=>{
  it('round-trips owner, read state, source, category and link through GET',async()=>{
    const f=fixture();const response=await call(notifications.GET,f);const [api]=await response.json();
    assert.deepEqual(normalizeNotification(api),normalizeNotification(note));
    assert.equal(api.isRead,true); // Retain compatibility for older HTTP consumers.
    assert.match(response.headers.get('cache-control')??'',/no-store/);
  });
  it('does not mistake unauthenticated or inactive access for an empty inbox',async()=>{
    assert.equal((await call(notifications.GET,fixture({signedIn:false}))).status,401);
    assert.equal((await call(notifications.GET,fixture({active:false}))).status,403);
  });
  it('rejects a client attempt to create a notification for a different account',async()=>{
    const f=fixture(); const response=await call(notifications.POST,f,'POST',{userId:otherId,title:'Injected',type:'info'});
    assert.equal(response.status,403);
    assert.equal(f.calls.some(c=>c.mode==='insert'),false);
  });
  it('does not allow invalid list limits to reach the database',async()=>{
    for(const limit of ['-1','NaN','2.5','0','201']) {
      const f=fixture();const response=await call(notifications.GET,f,'GET',undefined,'?limit='+limit);
      assert.equal(response.status,400,limit);
      assert.equal(f.calls.some(c=>c.table==='notifications'),false);
    }
  });
  it('rejects ambiguous or unbounded mark-read requests before a write',async()=>{
    for(const body of [{},{markAllRead:'true'},{ids:[]},{ids:[noteId],markAllRead:true},{ids:Array(201).fill(noteId)}]) {
      const f=fixture();assert.equal((await call(notifications.PUT,f,'PUT',body)).status,400);
      assert.equal(f.calls.some(c=>c.mode==='update'),false);
    }
  });
  it('scopes read updates to the active owner and only previously unread rows',async()=>{
    const f=fixture();assert.equal((await call(notifications.PUT,f,'PUT',{ids:[noteId,noteId]})).status,200);
    const q=f.calls.find(c=>c.mode==='update');
    assert.ok(q.filters.some(([k,v]:any)=>k==='user_id'&&v===userId));
    assert.ok(q.filters.some(([k,v]:any)=>k==='is_read'&&v===false));
    assert.deepEqual(q.filters.find(([k]:any)=>k==='id')[1],[noteId]);
  });
});

describe('Per-type notification preferences used by Telegram',()=>{
  it('reads an empty preference set without inserting a broken default record',async()=>{
    const f=fixture();const response=await call(preferences.GET,f);assert.equal(response.status,200);
    assert.deepEqual((await response.json()).data,[]);
    assert.equal(f.calls.some(c=>c.mode!=='select'),false);
  });
  it('reads multiple type-specific rows instead of assuming one preference per user',async()=>{
    const rows=[{notification_type:'order_confirmed',enabled:false},{notification_type:'chat_message',enabled:true}];
    const f=fixture({preferenceRows:rows});const response=await call(preferences.GET,f);
    assert.deepEqual((await response.json()).data,rows);
    assert.equal(f.calls.some(c=>c.mode!=='select'),false);
  });
  it('upserts only validated per-type fields with owner supplied by the session',async()=>{
    const f=fixture();const body={preferences:[{notification_type:'order_confirmed',enabled:false}]};
    assert.equal((await call(preferences.PATCH,f,'PATCH',body)).status,200);
    const q=f.calls.find(c=>c.mode==='upsert');assert.ok(q);
    assert.deepEqual(q.payload,[{user_id:userId,...body.preferences[0]}]);
    assert.equal(q.options.onConflict,'user_id,notification_type');
  });
  it('rejects arbitrary column writes and duplicate type entries',async()=>{
    for(const body of [{user_id:otherId,enabled:false},{preferences:[{notification_type:'info',enabled:false,user_id:otherId}]},
      {preferences:[{notification_type:'info',enabled:false},{notification_type:'info',enabled:true}]}]) {
      const f=fixture();assert.equal((await call(preferences.PATCH,f,'PATCH',body)).status,400);
      assert.equal(f.calls.some(c=>c.mode!=='select'),false);
    }
  });
});
