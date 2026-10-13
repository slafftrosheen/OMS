import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { orderFields, canonicalDraftFields, canonicalOrderProfiles,
  canEditDraft, canEditConfirmedMetadata, canManageOrderFile } from '../../src/lib/server/order/draft-contract';
import { normalizeOrderFile, storedOrderFileKey, ORDER_FILE_BUCKET,
  MAX_ORDER_FILE_BYTES } from '../../src/lib/server/files/order-storage';

const read=(file:string)=>readFileSync(file,'utf8');
const owner='53dd2bdb-b0aa-4dd7-a116-3b2358c64fd3';
const editor='8a9dd7b8-b197-49fc-923f-084d7b68aa1e';
const orderId='8ee7485e-57c2-4203-b43a-67ef8cfe9480';
const attachment='1a0d2274-df35-4332-92a9-0172d7bd211e';
const fixture={
  clientName:'Fabriek Signs',deadline:'2026-12-12',title:'Illuminated letters',
  priority:'HIGH',notes:'12V lighting',loadingDate:'2026-12-14',
  deliveryAddress:'Riga',deliveryContact:'Team',deliveryPhone:'+37112345678',
  deliveryEmail:'orders@example.com',isRd:true,rdNotes:'Test prototype',
  badges:{urgent:true},status:'PENDING_REVIEW' as const,
  profiles:[{quantity:3,quantity2:2,quantity3:0,quantity4:0,
    notes:'Coated finish',configuration:{height:120}}]
};

describe('OMS-R12 Order and Draft Order contract',()=>{
  it('accepts and round-trips all canonical form and profile fields',()=>{
    const form=orderFields.parse(fixture);
    const fields=canonicalDraftFields(form,true);
    expect(fields).toMatchObject({
      client:'Fabriek Signs',due_date:'2026-12-12',title:'Illuminated letters',
      priority:'HIGH',notes:'12V lighting',loading_date:'2026-12-14',
      delivery_address:'Riga',delivery_email:'orders@example.com',
      is_rd:true,rd_notes:'Test prototype',badges:{urgent:true}
    });
    expect(canonicalOrderProfiles(form.profiles)).toEqual([{
      profile_template_id:null,quantity1:3,quantity2:2,quantity3:0,quantity4:0,
      configuration:{height:120},notes:'Coated finish',order_index:0
    }]);
  });
  it('rejects PO/status injection, corrupted quantities and ambiguous unknown fields',()=>{
    expect(orderFields.safeParse({...fixture,poNumber:'INJECTED'}).success).toBe(false);
    expect(orderFields.safeParse({...fixture,profiles:[{quantity:-1}]}).success).toBe(false);
    expect(orderFields.safeParse({...fixture,profiles:[{quantity:1,configuration:{},unknown:'x'}]}).success).toBe(false);
    expect(orderFields.safeParse({...fixture,status:'CONFIRMED'}).success).toBe(false);
    expect(()=>canonicalDraftFields(orderFields.parse({}),true)).toThrow();
    expect(orderFields.safeParse({...fixture,deliveryEmail:'invalid'}).success).toBe(false);
  });
  it('authorizes draft creator or production management, blocks other users',()=>{
    for(const role of ['RD','Boss','HeadOfProduction']){
      expect(canEditDraft(role,owner,editor,'PENDING_REVIEW')).toBe(true);
      expect(canEditConfirmedMetadata(role)).toBe(true);
      expect(canManageOrderFile(role,owner,editor,'CONFIRMED')).toBe(true);
    }
    expect(canEditDraft('Operator',owner,owner,'DRAFT')).toBe(true);
    expect(canEditDraft('Operator',owner,editor,'DRAFT')).toBe(false);
    expect(canEditDraft('StationHead',owner,editor,'PENDING_REVIEW')).toBe(false);
    expect(canEditDraft('Boss',owner,editor,'CONFIRMED')).toBe(false);
    expect(canManageOrderFile('Operator',owner,owner,'CONFIRMED')).toBe(false);
    expect(canManageOrderFile('Boss',owner,editor,'DISPATCHED')).toBe(false);
    expect(canManageOrderFile('Boss',owner,editor,'VOIDED')).toBe(false);
  });
  it('enforces private order-file constraints including signage formats',()=>{
    expect(ORDER_FILE_BUCKET).toBe('files');
    expect(MAX_ORDER_FILE_BYTES).toBe(25*1024*1024);
    expect(normalizeOrderFile({name:'drawing.cdr',type:'application/octet-stream',size:1024}).mime).toBe('application/octet-stream');
    expect(normalizeOrderFile({name:'laser.dxf',type:'application/x-dxf',size:1024}).mime).toBe('application/dxf');
    expect(normalizeOrderFile({name:'artwork.pdf',type:'application/pdf',size:1024}).mime).toBe('application/pdf');
    expect(()=>normalizeOrderFile({name:'payload.exe',type:'application/octet-stream',size:300})).toThrow();
    expect(()=>normalizeOrderFile({name:'fake.pdf',type:'image/jpeg',size:300})).toThrow();
    expect(()=>normalizeOrderFile({name:'large.pdf',type:'application/pdf',size:MAX_ORDER_FILE_BYTES+1})).toThrow();
    expect(storedOrderFileKey(orderId,owner,attachment,'specification.pdf'))
      .toBe(`orders/${orderId}/${owner}/${attachment}-specification.pdf`);
  });
  it('uses atomic SQL that saves profiles against draft_order_id, never a second orders table',()=>{
    const sql=read('supabase/migrations/20261013000001_atomic_draft_forms.sql');
    expect(sql).toContain('FUNCTION public.oms_create_draft_form');
    expect(sql).toContain('FUNCTION public.oms_update_draft_form');
    expect(sql).toContain('SELECT * INTO v_order FROM public.draft_orders WHERE id=p_order_id FOR UPDATE');
    expect(sql).toContain('INSERT INTO public.order_profiles');
    expect(sql).toContain('draft_order_id,profile_template_id');
    expect(sql).toContain('DELETE FROM public.order_profiles WHERE draft_order_id=p_order_id');
    expect(sql).toContain("v_role NOT IN ('RD','Boss','HeadOfProduction')");
    expect(sql).toContain('p_order_id');
    expect(sql).toContain('ROLLBACK')===false; // transaction is managed by PostgreSQL
  });
  it('keeps draft creation/edit contracts strict and PO confirmation atomic',()=>{
    const create=read('src/routes/api/draft-orders/+server.ts');
    const update=read('src/routes/api/draft-orders/[id]/+server.ts');
    const confirm=read('src/routes/api/draft-orders/[id]/confirm/+server.ts');
    expect(create).toContain("rpc('oms_create_draft_form'");
    expect(create).toContain('canonicalOrderProfiles(input.profiles)');
    expect(update).toContain("rpc('oms_update_draft_form'");
    expect(update).toContain('canEditDraft(user.role');
    expect(update).not.toContain("from('draft_orders')\n        .delete()");
    expect(confirm).toContain("rpc(");
    expect(confirm).toContain("'confirm_order_with_stages'");
    expect(confirm).not.toContain("from('orders').insert");
  });
  it('persists attachments to the draft UUID and uses the same link after confirmation',()=>{
    const upload=read('src/lib/server/files/upload.ts');
    const link=read('src/lib/server/files/contract.ts');
    const get=read('src/routes/api/files/+server.ts');
    const download=read('src/routes/api/files/[fileId]/download/+server.ts');
    expect(upload).toContain("from('draft_orders').select('id,status,created_by')");
    expect(upload).toContain("canManageOrderFile(user.role");
    expect(upload).toContain('locals.supabase.storage.from(ORDER_FILE_BUCKET)');
    expect(upload).toContain('buildOrderFileLink(order.id,file.id');
    expect(link).toContain('draft_order_id: orderId');
    expect(get).toContain(".eq('draft_order_id', order.id)");
    expect(download).toContain('readOrderStoredFile(locals,file)');
    expect(download).not.toContain('getSignedUrl(');
    expect(upload).not.toContain('storageService.upload');
  });
  it('uses correct editor endpoints, UUIDs, confirmed-stage RPC and role-gated fields',()=>{
    const edit=read('src/routes/orders/[id]/edit/+page.svelte');
    const create=read('src/routes/orders/new/+page.svelte');
    const files=read('src/lib/order/OrderFiles.svelte');
    expect(edit).toContain('let orderId: string | null');
    expect(edit).toContain('can($currentUser,');
    expect(edit).toContain('/confirm`');
    expect(edit).not.toContain('/approve`');
    expect(edit).not.toContain('notes, priority, status,');
    expect(edit).toContain('quantity2: p.quantity2');
    expect(edit).toContain('<OrderFiles {orderId}');
    expect(edit).toContain('canUpload={canEdit');
    expect(create).toContain("can($currentUser, 'createDraftOrder')");
    expect(create).toContain('savedOrderId = String(orderId)');
    expect(create).toContain("method:'PUT'");
    expect(files).toContain('fileError');
    expect(files).toContain('{#if canUpload}');
  });
});
