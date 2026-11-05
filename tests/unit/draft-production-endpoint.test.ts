import {describe,it,expect} from 'vitest';
import {POST} from '../../src/routes/api/ai/order-intake/+server';
const id='11111111-1111-4111-8111-111111111111';
const order={id,status:'DRAFT',created_by:id,updated_at:'2026-11-05T12:00:00Z'};
function event(body:unknown,user:unknown={id,role:'RD'},row:unknown=order){
 const result={data:row,error:null};
 const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>result};
 return {request:new Request('http://localhost/api/ai/order-intake',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
  locals:{user,supabase:{from:()=>query}},getClientAddress:()=>id} as any;
}
async function status(e:any){try{await POST(e);return 200;}catch(err:any){return err.status;}}
describe('production intake API boundary',()=>{
 it('refuses anonymous users before reading documents',async()=>{
  expect(await status(event({orderId:id},null))).toBe(401);
 });
 it('rejects arbitrary paths, invented IDs and ambiguous PDF billing modes',async()=>{
  expect(await status(event({orderId:id,fileUrl:'file:///etc/passwd'}))).toBe(400);
  expect(await status(event({orderId:id,materialId:id}))).toBe(400);
  expect(await status(event({orderId:id,nativePdf:true}))).toBe(400);
 });
 it('refuses stale or unauthorized drafts before calling OpenRouter',async()=>{
  expect(await status(event({orderId:id,expectedUpdatedAt:'2026-11-04T12:00:00Z'}))).toBe(409);
  expect(await status(event({orderId:id},{id:'other',role:'Worker'}))).toBe(403);
  expect(await status(event({orderId:id},{id,role:'RD'},{...order,status:'CONFIRMED'}))).toBe(403);
 });
});

import {createOrderIntakeHandler} from '../../src/lib/server/order/intake';
import {GET as addressGET} from '../../src/routes/api/client-delivery-addresses/+server';
const emptyModel={proposals:[],profileSuggestions:[],missing:[],production:[]};
let sequence=0;
function intakeEvent({output=emptyModel,change=false,unlink=false,malformed=false,fail=false}:{output?:any;change?:boolean;unlink?:boolean;malformed?:boolean;fail?:boolean}={}){
 const fileId='22222222-2222-4222-8222-222222222222';
 const bytes=Buffer.from('%PDF-1.7\nexample image-only production drawing');
 let orderReads=0,linkReads=0;
 let sent:any;
 const db={from(table:string){
  const query:any={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,range:()=>query,abortSignal:()=>query,
   maybeSingle:async()=>result(),then:(resolve:any)=>Promise.resolve(result()).then(resolve)};
  function result(){
   if(table==='draft_orders')return {data:{...order,notes:'',...(change&&orderReads++>0?{updated_at:'2026-11-06T12:00:00Z'}:{})},error:null};
   if(table==='order_files')return {data:unlink&&linkReads++>0?null:{file_id:fileId},error:null};
   if(table==='files')return {data:{id:fileId,mimetype:'application/pdf',size:bytes.length,original_name:'Drawing.pdf',filepath:'orders/example.pdf',metadata:{storage_bucket:'files'}},error:null};
   if(table==='order_profiles')return {data:[{id:'saved-profile-id',configuration:{},quantity1:1,order_index:0}],error:null};
   if(table==='materials')return {count:1,data:[{id:'33333333-3333-4333-8333-333333333333',code:'REAL_PLEXI',category:'ACRYLIC_XT',name_en:'Plexi actual',metadata:{model:'5N870'}}],error:null};
   return {data:{locale:'en'},error:null};
  }
  return query;
 },storage:{from:()=>({download:async()=>({data:new Blob([bytes]),error:null})})}};
 const e=event({orderId:id,fileId,profileIndex:0,expectedUpdatedAt:order.updated_at});
 e.locals.user={...e.locals.user,id:`${(++sequence).toString().padStart(8,'0')}-1111-4111-8111-111111111111`};
 e.locals.supabase=db;
 const handler=createOrderIntakeHandler(async(messages,options)=>{
  sent={messages,options};
  if(fail)throw new Error('Provider unavailable');
  return {text:malformed?'not JSON':JSON.stringify(output),model:'configured/model',annotations:[],webSearchRequests:null};
 });
 return {e,handler,sent:()=>sent};
}
describe('production intake actual handler with a provider boundary double',()=>{
 it('reads linked bytes, validates structured facts and returns a real catalog identity without writing',async()=>{
  const sample=intakeEvent({output:{...emptyModel,production:[{
   target:'faceMaterial',value:'5N870',evidence:'BLUE 5N870',page:1,part:null,confidence:'medium'
  }]}});
  const response=await sample.handler(sample.e);
  const result=await response.json();
  expect(result.production[0].material.id).toBe('33333333-3333-4333-8333-333333333333');
  expect(result.profileId).toBe('saved-profile-id');
  expect(result.orderUpdatedAt).toBe(order.updated_at);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(sample.sent().options.jsonSchema.schema.properties.production).toBeTruthy();
  expect(sample.sent().options.plugins).toEqual([{id:'file-parser',pdf:{engine:'cloudflare-ai'}}]);
  expect(sample.sent().messages[1].content[1].file.file_data).toContain('data:application/pdf;base64,');
 });
 it('keeps conflicting deadlines out of the executable proposals',async()=>{
  const sample=intakeEvent({output:{...emptyModel,proposals:[
   {field:'deadline',value:'2026-11-19',evidence:'Nov 19 ACE',confidence:'low'},
   {field:'deadline',value:'2026-11-27',evidence:'DELIVERY Nov 27 2026',confidence:'high'}
  ]}});
  const result=await (await sample.handler(sample.e)).json();
  expect(result.proposals).toEqual([]);
  expect(result.orderConflicts[0].alternatives).toHaveLength(2);
 });
 it('rejects stale revisions and removed file links after the provider returns',async()=>{
  for(const options of [{change:true},{unlink:true}]){
   const sample=intakeEvent(options);
   let received=0;try{await sample.handler(sample.e);}catch(err:any){received=err.status;}
   expect(received).toBe(409);
  }
 });
 it('fails closed on invalid JSON, invented IDs and provider failures',async()=>{
  for(const options of [{malformed:true},{fail:true},{output:{...emptyModel,production:[{
   target:'faceMaterial',value:'5N870',evidence:'BLUE 5N870',page:1,part:null,confidence:'high',materialId:id
  }]}}]){
   const sample=intakeEvent(options);
   let received=0;try{await sample.handler(sample.e);}catch(err:any){received=err.status;}
   expect(received).toBe(503);
  }
 });
 it('requires authentication and a bounded client name for saved-address lookup',async()=>{
  for(const e of [{locals:{user:null},url:new URL('http://localhost/api/client-delivery-addresses?client=Test')},
   {locals:{user:{id}},url:new URL('http://localhost/api/client-delivery-addresses')}]){
    let received=0;try{await addressGET(e as any);}catch(err:any){received=err.status;}
    expect([400,401]).toContain(received);
  }
 });
});

describe('explicit native PDF routing',()=>{
 it('uses only the configured native model, with no automatic OCR fallback',async()=>{
  const old=process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL;
  process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL='provider/native-pdf-model';
  try{
   const sample=intakeEvent();
   sample.e.request=new Request(sample.e.request,{body:JSON.stringify({orderId:id,
    fileId:'22222222-2222-4222-8222-222222222222',nativePdf:true,profileIndex:0})});
   await sample.handler(sample.e);
   expect(sample.sent().options.model).toBe('provider/native-pdf-model');
   expect(sample.sent().options.plugins).toEqual([{id:'file-parser',pdf:{engine:'native'}}]);
  }finally{
   if(old===undefined)delete process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL;
   else process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL=old;
  }
 });
});
