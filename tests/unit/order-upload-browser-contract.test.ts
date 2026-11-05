import { describe, it, expect } from 'vitest';
import { uploadOrderFile } from '../../src/lib/server/files/upload';
const orderId='11111111-1111-4111-8111-111111111111';
function request(type:string,contents='%PDF-1.4\nTEST ONLY\n') {
 const form=new FormData();form.append('file',new File([contents],'TEST-ONLY.pdf',{type}));form.append('order_id',orderId);
 return new Request('http://localhost/api/files',{method:'POST',body:form});
}
function locals() {
 const uploaded:any[]=[];
 return {uploaded,user:{id:'22222222-2222-4222-8222-222222222222',role:'Boss'},supabase:{
  from(table:string){
   const query:any={select(){return query;},limit(){return query;},eq(){return query;},
    maybeSingle:async()=>({data:{id:orderId,status:'DRAFT',created_by:'manager'},error:null}),
    insert(value:any){if(table==='order_files')return Promise.resolve({error:null});query.value=value;return query;},
    single:async()=>({data:{id:'33333333-3333-4333-8333-333333333333',...query.value},error:null})};return query;
  },storage:{from(bucket:string){return {upload:async(key:string,buffer:Buffer,options:any)=>{uploaded.push({bucket,key,buffer,options});return {error:null};}};}}
 }};
}
describe('browser multipart upload contract',()=>{
 it('accepts PDF uploads with empty or generic MIME and keeps their exact private bytes',async()=>{
  const previous=process.env.BODY_SIZE_LIMIT;process.env.BODY_SIZE_LIMIT='32M';
  try {
   for(const mime of ['', 'application/octet-stream','application/pdf']) {
    const actor=locals();const result=await uploadOrderFile(request(mime),actor as any);
    expect(result.success).toBe(true);expect(actor.uploaded).toHaveLength(1);
    expect(actor.uploaded[0].bucket).toBe('files');
    expect(actor.uploaded[0].buffer.toString()).toBe('%PDF-1.4\nTEST ONLY\n');
    expect(actor.uploaded[0].options.contentType).toBe('application/pdf');
   }
  } finally {if(previous===undefined)delete process.env.BODY_SIZE_LIMIT;else process.env.BODY_SIZE_LIMIT=previous;}
 });
 it('rejects disguised PDF contents before writing anything to storage',async()=>{
  const previous=process.env.BODY_SIZE_LIMIT;process.env.BODY_SIZE_LIMIT='32M';
  try {
   const actor=locals();let status;
   try {await uploadOrderFile(request('', '<script>not a PDF</script>'),actor as any);}catch(error:any){status=error.status;}
   expect(status).toBe(415);expect(actor.uploaded).toHaveLength(0);
  } finally {if(previous===undefined)delete process.env.BODY_SIZE_LIMIT;else process.env.BODY_SIZE_LIMIT=previous;}
 });
});
