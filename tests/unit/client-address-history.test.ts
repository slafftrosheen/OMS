import {describe,it,expect} from 'vitest';
import {GET} from '../../src/routes/api/client-delivery-addresses/[addressId]/history/+server';
import {GET as capabilities} from '../../src/routes/api/ai/order-intake/+server';
const id='11111111-1111-4111-8111-111111111111';
function event(options:{user?:boolean;addressId?:string;query?:string;failed?:boolean;count?:number|null}={}){
 const observed:any={};
 const q:any={select:(...args:any[])=>{observed.select=args;return q;},eq:(column:string,value:unknown)=>{observed[column]=value;return q;},
 order:()=>q,range:(from:number,to:number)=>{observed.range=[from,to];return q;},abortSignal:()=>q,
 then:(resolve:any)=>Promise.resolve({data:[{id,raw_address:'Example Street',contact:'Contact',phone:null,email:null,used_at:'2026-11-05T12:00:00Z',source_order_id:id}],error:options.failed?{code:'offline'}:null,count:options.count===undefined?21:options.count}).then(resolve)};
 return {e:{locals:{user:options.user===false?null:{id},supabase:{from:(table:string)=>{observed.table=table;return q;}}},params:{addressId:options.addressId??id},
  request:new Request('http://localhost'),url:new URL('http://localhost/history'+(options.query??''))} as any,observed};
}
async function status(e:any){try{return (await GET(e)).status;}catch(err:any){return err.status;}}
describe('read-only client address use history',()=>{
 it('rejects anonymous or malformed reads before touching the database',async()=>{
  for(const options of [{user:false},{addressId:'unknown'},{query:'?offset=-1'},{query:'?offset=abc'},{query:'?offset=10001'}]){
   const {e,observed}=event(options);
   expect([400,401]).toContain(await status(e));expect(observed.table).toBe(undefined);
  }
 });
 it('reads a bounded page through the caller client and carries an exact continuation',async()=>{
  const {e,observed}=event();const response=await GET(e);const page=await response.json();
  expect(observed.table).toBe('client_delivery_address_history');expect(observed.address_id).toBe(id);
  expect(observed.range).toEqual([0,19]);expect(page.total).toBe(21);
  expect(page.items[0].raw_address).toBe('Example Street');expect(page.nextOffset).toBe(1);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
 });
 it('fails visibly when history or an exact count is unavailable',async()=>{
  expect(await status(event({failed:true}).e)).toBe(503);
  expect(await status(event({count:null}).e)).toBe(503);
 });
});
describe('intake PDF capabilities',()=>{
 it('requires authentication and exposes configuration flags without credentials or model IDs',async()=>{
  let received=200;try{await capabilities({locals:{user:null}} as any);}catch(err:any){received=err.status;}
  expect(received).toBe(401);
  const oldModel=process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL,oldOcr=process.env.OPENROUTER_TOOLKIT_PDF_OCR;
  process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL='provider/configured-private-model';process.env.OPENROUTER_TOOLKIT_PDF_OCR='false';
  try{const response=await capabilities({locals:{user:{id}}} as any);expect(await response.json()).toEqual({nativePdf:true,paidOcr:false});}
  finally{if(oldModel===undefined)delete process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL;else process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL=oldModel;
   if(oldOcr===undefined)delete process.env.OPENROUTER_TOOLKIT_PDF_OCR;else process.env.OPENROUTER_TOOLKIT_PDF_OCR=oldOcr;}
 });
});
