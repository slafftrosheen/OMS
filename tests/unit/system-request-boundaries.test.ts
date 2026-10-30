import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readBoundedJson, RequestBodyError } from '../../src/lib/server/api/bounded-json';
import { requireActiveAccount, AccountAccessError } from '../../src/lib/server/auth/active-account';

function streamed(chunks:Uint8Array[],headers:Record<string,string>={}) {
  return new Request('https://oms.invalid/api/test',{method:'POST',headers,
    body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}}),duplex:'half'} as RequestInit);
}
const bytes=(value:string)=>new TextEncoder().encode(value);
const status=(expected:number)=>(cause:unknown)=>cause instanceof RequestBodyError && cause.status===expected;

describe('Shared request/account boundaries',()=>{
  it('counts actual stream bytes despite a false Content-Length',async()=>{
    await assert.rejects(()=>readBoundedJson(streamed([bytes('{"title":"'),bytes('x'.repeat(40)),bytes('"}')],{'content-length':'2'}),32),status(413));
  });
  it('preserves UTF-8 text split across chunks',async()=>{
    const raw=bytes('{"title":"Čau 👋"}');
    assert.deepEqual(await readBoundedJson(streamed([...raw].map(byte=>new Uint8Array([byte])))),{title:'Čau 👋'});
  });
  it('rejects invalid UTF-8 rather than storing replacement characters',async()=>{
    await assert.rejects(()=>readBoundedJson(streamed([new Uint8Array([123,34,120,34,58,34,255,34,125])])),status(400));
  });
  it('rejects missing and malformed JSON bodies consistently',async()=>{
    await assert.rejects(()=>readBoundedJson(new Request('https://oms.invalid',{method:'POST'})),status(400));
    await assert.rejects(()=>readBoundedJson(streamed([bytes('{')])),status(400));
  });
  it('accepts exactly the byte limit but not a multibyte overrun',async()=>{
    const raw=bytes('{"x":"ā"}');assert.deepEqual(await readBoundedJson(streamed([raw]),raw.length),{x:'ā'});
    await assert.rejects(()=>readBoundedJson(streamed([raw]),raw.length-1),status(413));
  });
  it('keeps an over-limit error even if stream cancellation itself rejects',async()=>{
    const request=new Request('https://oms.invalid',{method:'POST',body:new ReadableStream({
      start(c){c.enqueue(bytes('x'.repeat(40)));},cancel(){throw new Error('transport closed');}
    }),duplex:'half'} as RequestInit);
    await assert.rejects(()=>readBoundedJson(request,32),status(413));
  });
  it('uses only server account identity and rejects inactive profiles',async()=>{
    const ids:string[]=[];
    const supabase:any={from:()=>({select:()=>({eq:(_key:string,id:string)=>{ids.push(id);return {single:async()=>({data:{is_active:false},error:null})};}})})};
    await assert.rejects(()=>requireActiveAccount({user:{id:'owner'},supabase}),e=>e instanceof AccountAccessError&&e.status===403);
    assert.deepEqual(ids,['owner']);
  });
  it('fails closed and never surfaces raw database errors',async()=>{
    const supabase:any={from(){throw new Error('private connection string');}};
    await assert.rejects(()=>requireActiveAccount({user:{id:'owner'},supabase}),e=>e instanceof AccountAccessError&&e.status===503&&!e.message.includes('private'));
    await assert.rejects(()=>requireActiveAccount({user:null,supabase}),e=>e instanceof AccountAccessError&&e.status===401);
  });
});
