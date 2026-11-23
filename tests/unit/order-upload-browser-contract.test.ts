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

describe('generated Canvas exports', () => {
 const requestId = '11111111-2222-4333-8444-555555555555';

 function generated(contents = '%PDF-1.7\nPanel\n', pocket = 'visuals') {
  const form = new FormData();
  form.set('file', new File([contents], 'Panel.pdf', { type: 'application/pdf' }));
  form.set('order_id', orderId);
  form.set('file_type', pocket);
  form.set('canvas_export_request_id', requestId);
  return new Request('http://localhost/api/files/upload', { method: 'POST', body: form });
 }

 function exportLocals({ loseResponse = false, afterWrite }: { loseResponse?: boolean; afterWrite?: () => Promise<void> } = {}) {
  const { user, supabase } = locals();
  const uploaded: string[] = [], removed: string[] = [];
  let saved: Record<string, any> | undefined;
  let registrations = 0;
  const rpc = async (name: string, args: Record<string, string | number>) => {
   expect(name).toBe('register_canvas_export');
   registrations++;
   saved ??= {
    id: args.p_file_id, filepath: args.p_storage_key, uploaded_by: user.id, file_type: args.p_pocket,
    mimetype: args.p_mime, original_name: args.p_original_name, size: args.p_size,
    metadata: { canvas_export_fingerprint: args.p_fingerprint }
   };
   if (loseResponse && registrations === 1) return { data: null, error: { code: '', message: 'Connection reset' } };
   return { data: saved, error: null };
  };
  return {
   uploaded, removed, registrations: () => registrations,
   actor: { user, supabase: {
    from(table: string) {
     if (table !== 'order_files') return supabase.from(table);
     const query = { select: () => query, eq: () => query, maybeSingle: async () => ({
      data: saved && { files: saved, file_type: saved.file_type }, error: null
     }) };
     return query;
    },
    storage: { from: () => ({
     upload: async (path: string) => { uploaded.push(path); await afterWrite?.(); return { error: null }; },
     remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; }
    }) }, rpc
   } } as unknown as App.Locals
  };
 }

 it('recovers a committed attachment after a lost database response', async () => {
  const previous = process.env.BODY_SIZE_LIMIT;
  process.env.BODY_SIZE_LIMIT = '32M';
  try {
   const { actor, uploaded, removed, registrations } = exportLocals({ loseResponse: true });
   await expect(uploadOrderFile(generated(), actor)).rejects.toMatchObject({ status: 503 });
   const retry = await uploadOrderFile(generated(), actor);
   expect(retry.file.path).toBe(uploaded[0]);
   expect(retry.file.file_type).toBe('visuals');
   await expect(uploadOrderFile(generated('%PDF-1.7\nDifferent\n'), actor)).rejects.toMatchObject({ status: 409 });
   await expect(uploadOrderFile(generated(undefined, 'cnc'), actor)).rejects.toMatchObject({ status: 409 });
   expect(registrations()).toBe(1);
   expect(uploaded).toHaveLength(1);
   expect(removed).toEqual([]);
  } finally { if (previous === undefined) delete process.env.BODY_SIZE_LIMIT; else process.env.BODY_SIZE_LIMIT = previous; }
 });

 it('keeps the winning blob and removes the redundant blob when saves overlap', async () => {
  const previous = process.env.BODY_SIZE_LIMIT;
  process.env.BODY_SIZE_LIMIT = '32M';
  try {
   let bothWriting!: () => void;
   const writing = new Promise<void>(resolve => { bothWriting = resolve; });
   let writes = 0;
   const { actor, uploaded, removed, registrations } = exportLocals({ afterWrite: async () => {
    if (++writes === 2) bothWriting();
    await writing;
   } });
   const [first, second] = await Promise.all([uploadOrderFile(generated(), actor), uploadOrderFile(generated(), actor)]);
   expect(second).toEqual(first);
   expect(registrations()).toBe(2);
   expect(uploaded).toHaveLength(2);
   expect(removed).toEqual(uploaded.filter(path => path !== first.file.path));
  } finally { if (previous === undefined) delete process.env.BODY_SIZE_LIMIT; else process.env.BODY_SIZE_LIMIT = previous; }
 });
});
