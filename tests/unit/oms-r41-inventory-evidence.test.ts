import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {POST as changeReview} from '../../src/routes/api/production/exception-reviews/+server';
import {parseReviewChange} from '../../src/lib/order/production-exceptions';

const read=(p:string)=>readFileSync(p,'utf8');
const order='11111111-1111-4111-8111-111111111111';
const movement='22222222-2222-4222-8222-222222222222';
const changedAt='2026-10-16T12:00:00Z';

describe('OMS-R41: real inventory evidence, atomic stock writes and audited references',()=>{
 it('constrains movement references by count, UUID, uniqueness and review action',()=>{
   expect(parseReviewChange({action:'resolve',reviewId:order,
     expectedUpdatedAt:changedAt,note:'Material reconciled',
     evidenceMovementIds:[movement]}).evidenceMovementIds).toEqual([movement]);
   expect(()=>parseReviewChange({action:'resolve',reviewId:order,
     expectedUpdatedAt:changedAt,note:'done',evidenceMovementIds:['bogus']})).toThrow();
   expect(()=>parseReviewChange({action:'resolve',reviewId:order,
     expectedUpdatedAt:changedAt,note:'done',
     evidenceMovementIds:[movement,movement]})).toThrow();
   expect(()=>parseReviewChange({action:'update',reviewId:order,
     expectedUpdatedAt:changedAt,note:'next',dueDate:'2026-10-17',
     evidenceMovementIds:Array(11).fill(movement)})).toThrow();
   expect(()=>parseReviewChange({action:'claim',orderId:order,station:'CAD',
     kind:'MATERIAL_SKIPPED',dueDate:'2026-10-18',
     evidenceMovementIds:[movement]})).toThrow();
 });
 it('returns only the original, authorized review stage and order-scoped inventory movements',()=>{
   const api=read('src/routes/api/production/exception-evidence/+server.ts');
   expect(api).toContain('canManageSharedInventory(locals.user.role)');
   expect(api).toContain(".from('production_exception_reviews')");
   expect(api).toContain(".from('draft_orders')");
   expect(api).toContain(".from('order_stages')");
   expect(api).toContain(".from('inventory_movements')");
   expect(api).toContain(".eq('reference_type','order').eq('reference_id',review.draft_order_id)");
   expect(api).toContain("stage.draft_order_id!==review.draft_order_id");
   expect(api).toContain("stage.station!==review.station");
   expect(api).toContain("movementResponse.count>LIMIT");
   expect(api).toContain('stageAttributionVerified:false');
   expect(api).toContain("'Cache-Control':'private, no-store'");
   expect(api).not.toContain("method:'POST'");
   expect(api).not.toContain(".update(");
 });
 it('requires management authorization before reading or writing review evidence',async()=>{
   for(const [user,status] of [[null,401],[{role:'CNC'},403]] as const){
     await assert.rejects(async()=>await changeReview({locals:{user},request:new Request('http://localhost',{
       method:'POST',body:'{}'
     })} as any),(error:any)=>error.status===status);
   }
 });
 it('rejects citations with another order, reference type or movement ID before the audit RPC',async()=>{
   for(const changes of [{reference_id:'another-order'},
     {reference_type:'manual'},{id:'another-movement'}]){
     const {event,rpcCalls}=movementReviewEvent(changes);
     await assert.rejects(async()=>await changeReview(event),(error:any)=>error.status===409);
     expect(rpcCalls).toHaveLength(0);
   }
 });
 it('saves verified order movement citations in the existing audited review RPC',async()=>{
   const {event,rpcCalls}=movementReviewEvent();
   const response=await changeReview(event);
   expect(response.status).toBe(200);
   expect(rpcCalls).toHaveLength(1);
   expect(rpcCalls[0]).toMatchObject({name:'oms_manage_production_exception',args:{
     p_action:'resolve',p_review_id:order,p_expected_updated_at:changedAt
   }});
   expect(rpcCalls[0].args.p_note).toContain('Material reconciled');
   expect(rpcCalls[0].args.p_note).toContain(movement);
 });
 it('replaces unsafe split app writes with one manager-only transaction',()=>{
   const api=read('src/routes/api/inventory/movements/+server.ts');
   const sql=read('supabase/migrations/20261016000004_inventory_audit_atomic_manual_movements.sql');
   expect(api).toContain('canManageSharedInventory(locals.user.role)');
   expect(api).toContain('oms_record_manual_inventory_movement');
   expect(api).toContain('p_request_id:body.requestId');
   expect(api).toContain("if(body.refPO)throw error(409");
   expect(api).not.toContain(".from('materials').update");
   expect(api).not.toContain(".from('inventory_movements').insert");
   expect(sql).toContain('p_request_id UUID');
   expect(sql).toContain('stock_before INTEGER');
   expect(sql).toContain('stock_after INTEGER');
   expect(sql).toContain('UNIQUE INDEX IF NOT EXISTS inventory_movements_request_id_unique');
   expect(sql).toContain("v_role NOT IN ('RD','Boss','HeadOfProduction')");
   expect(sql).toContain('FROM public.materials WHERE id=p_material_id FOR UPDATE');
   expect(sql).toContain('WHERE request_id=p_request_id');
   expect(sql).toContain('v_movement.performed_by IS DISTINCT FROM v_actor');
   expect(sql).toContain('IF v_stock_after<0 OR v_stock_after>2147483647');
   expect(sql).toContain('UPDATE public.materials SET stock=v_stock_after');
   expect(sql).toContain('INSERT INTO public.inventory_movements');
   expect(sql).toContain('REVOKE INSERT,UPDATE,DELETE ON public.inventory_movements FROM authenticated,anon');
   expect(sql).toContain('REVOKE ALL ON FUNCTION public.consume_materials_for_order(UUID,TEXT,JSONB,UUID)');
   expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
   expect(sql).toContain('CREATE OR REPLACE FUNCTION public.oms_require_atomic_stock_write()');
   expect(sql).toContain("current_user IN ('authenticated','anon')");
   expect(sql).toContain('CREATE TRIGGER oms_material_stock_write_guard');
   expect(sql).toContain('CREATE TRIGGER oms_item_stock_write_guard');
   expect(sql).toContain('CREATE POLICY "OMS R41 active staff movement read"');
   expect(sql).toContain('p.id=auth.uid() AND p.is_active=TRUE');
   expect(sql).toContain('REVOKE SELECT ON public.inventory_movements FROM anon');
 });
 it('blocks unaudited stock fields in legacy item/material update and create routes',()=>{
   const item=read('src/routes/api/inventory/items/[id]/+server.ts');
   const items=read('src/routes/api/inventory/items/+server.ts');
   const material=read('src/routes/api/materials/[id]/+server.ts');
   const materials=read('src/routes/api/materials/+server.ts');
   expect(item).toContain('canManageSharedInventory(locals.user.role)');
   expect(item).toContain("if(data.stock!==undefined)");
   expect(item).not.toContain('updates.stock = data.stock');
   expect(items).toContain("stock: 0");
   expect(items).toContain('canManageSharedInventory(locals.user.role)');
   expect(material).toContain("hasOwnProperty.call(body,'stock')");
   expect(materials).toContain('data.stock=0');
 });
 it('keeps order stock deduction solely in canonical stage completion',()=>{
   const store=read('src/lib/inventory/store.ts');
   const api=read('src/routes/api/orders/[id]/stages/[station]/complete/+server.ts');
   expect(store).toContain('crypto.randomUUID()');
   expect(store).toContain("if(options.refPO)");
   expect(store).toContain('requestId,materialId,kind,qty');
   expect(api).toContain("complete_stage_with_consumption");
 });
 it('provides manager-facing original evidence and explicit order-vs-stage attribution warning',()=>{
   const component=read('src/lib/components/production/ProductionExceptionEvidence.svelte');
   const page=read('src/routes/production/exceptions/+page.svelte');
   expect(component).toContain('/api/production/exception-evidence?');
   expect(component).toContain("data.evidenceIsOrderScoped!==true");
   expect(component).toContain("data.stageAttributionVerified!==false");
   expect(component).toContain('row.stockBefore');
   expect(component).toContain('onReference(row.id)');
   expect(component).toContain('productionEvidence.orderScopeWarning');
   expect(page).toContain('<ProductionExceptionEvidence');
   expect(page).toContain('selectedEvidenceIds');
   expect(page).toContain('evidenceMovementIds=selectedEvidenceIds');
   expect(page).toContain('productionEvidence.maxReferences');
 });
 it('localizes evidence warnings and review controls in EN, RU, LV',()=>{
   const keys=['title','original','loadFailed','movements','orderScopeWarning',
     'truncated','noMovements','movementId','citeMovement','selected',
     'viewEvidence','maxReferences','referencesSelected'];
   for(const lang of ['en','ru','lv']){
     const data=JSON.parse(read(`src/locales/${lang}.json`)).productionEvidence;
     for(const key of keys)expect(typeof data[key]).toBe('string');
     expect(data.movements).toContain('{count}');
   }
 });
});

// Query-boundary fixture: actual handler filters decide which records are visible.
function movementReviewEvent(changes:Record<string,unknown>={}){
 const rpcCalls:{name:string;args:Record<string,unknown>}[]=[];
 const tables:Record<string,Record<string,unknown>[]>={
   production_exception_reviews:[{id:order,draft_order_id:order,kind:'MATERIAL_SKIPPED'}],
   inventory_movements:[{id:movement,reference_type:'order',reference_id:order,...changes}]
 };
 const supabase={
   from(table:string){
     let rows=tables[table];
     if(!rows)throw new Error('Unexpected table '+table);
     const query={
       select(){return query;},
       eq(key:string,value:unknown){rows=rows.filter(row=>row[key]===value);return query;},
       in(key:string,values:unknown[]){rows=rows.filter(row=>values.includes(row[key]));return query;},
       async maybeSingle(){return {data:rows[0]??null,error:null};},
       then(resolve:(result:unknown)=>unknown){return Promise.resolve({data:rows,error:null}).then(resolve);}
     };
     return query;
   },
   async rpc(name:string,args:Record<string,unknown>){
     rpcCalls.push({name,args});return {data:{id:order},error:null};
   }
 };
 return {rpcCalls,event:{locals:{user:{role:'Boss'},supabase},
   request:new Request('http://localhost/api/production/exception-reviews',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action:'resolve',reviewId:order,expectedUpdatedAt:changedAt,
       note:'Material reconciled',evidenceMovementIds:[movement]})
   })} as any};
}
