import {describe,it,expect} from 'vitest';
import {GET,POST} from '../../../routes/api/chat/messages/+server';
const url=new URL('http://localhost/api/chat/messages?roomId=general');

describe('chat message HTTP failures',()=>{
  it('denies anonymous room reads and writes before touching storage',async()=>{
    const read=await GET({url,locals:{}} as any);
    expect(read.status).toBe(401);
    const write=await POST({locals:{},request:new Request(url,{method:'POST',body:JSON.stringify({roomId:'general',text:'hello'})})} as any);
    expect(write.status).toBe(401);
  });
  it('rejects non-text messages as client errors',async()=>{
    const response=await POST({locals:{user:{id:'actor'}},request:new Request(url,{method:'POST',body:JSON.stringify({roomId:'general',text:{value:'invalid'}})})} as any);
    expect(response.status).toBe(400);
  });
  it('never reports a failed room read as successful empty history',async()=>{
    const query:any={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,
      then:(resolve:any)=>Promise.resolve({data:null,error:{message:'schema unavailable'}}).then(resolve)};
    const response=await GET({url,locals:{user:{id:'actor'},supabase:{from:()=>query}}} as any);
    expect(response.status).toBe(500);
    expect((await response.json()).success).toBe(false);
  });
});

describe('existing station room identity',()=>{
  it('reuses a visible station room without requiring an update grant',async()=>{
    const {POST:ensureRoom}=await import('../../../routes/api/chat/+server');
    const room={id:'station-cad',name:'CAD',kind:'station'};
    const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:room,error:null})};
    const response=await ensureRoom({locals:{user:{id:'operator'},supabase:{from:()=>query}},request:new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({id:room.id,name:'Must not overwrite'})})} as any);
    expect(response.status).toBe(200);
    expect((await response.json()).room).toEqual(room);
  });
});

describe('chat search deletion boundary',()=>{
  it('excludes soft-deleted messages from search results',async()=>{
    const {GET:search}=await import('../../../routes/api/chat/search/+server');
    const rows=[{id:'deleted',content:'hidden TEST message',is_deleted:true}];
    const filters:Array<[string,unknown]>=[];
    const query:any={select:()=>query,ilike:()=>query,order:()=>query,limit:()=>query,
      eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},
      then:(resolve:any)=>Promise.resolve({data:rows.filter(row=>filters.every(([key,value])=>row[key]===value)),error:null}).then(resolve)};
    const response=await search({url:new URL('http://localhost/api/chat/search?q=TEST'),locals:{user:{id:'actor'},supabase:{from:()=>query}}} as any);
    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([]);
  });
});
