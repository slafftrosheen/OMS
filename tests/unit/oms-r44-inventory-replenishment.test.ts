import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {deriveReplenishmentCandidates,parseReplenishmentChange,
 type ReplenishmentRequest,type ReplenishmentMaterial
} from '../../src/lib/inventory/replenishment';

const read=(path:string)=>readFileSync(path,'utf8');
const id='11111111-1111-4111-8111-111111111111';
const rid='22222222-2222-4222-8222-222222222222';
const saved='2026-10-18T11:00:00+03:00';
const material=(changes:Partial<ReplenishmentMaterial>={}):ReplenishmentMaterial=>({
 id,sku:'MAT-1',name_en:'White sheet',stock:2,min_stock:5,max_stock:20,
 unit:'sheet',supplier:'Local supplier',vendor:'Old vendor',price:12.5,
 updated_at:saved,...changes
});
const request=(changes:Partial<ReplenishmentRequest>={}):ReplenishmentRequest=>({
 id:rid,material_id:id,quantity:12,unit:'sheet',supplier_label:'Local supplier',
 supplier_reference:null,note:'Awaiting quote',status:'OPEN',
 stock_at_request:2,minimum_at_request:5,created_by:id,updated_by:id,
 created_at:saved,updated_at:saved,ordered_at:null,closed_at:null,...changes
});

describe('OMS-R44 — manager-only canonical replenishment follow-ups',()=>{
 it('reports low-stock candidates and uses max as a reference target, never an automatic order',()=>{
   const candidates=deriveReplenishmentCandidates([
     material(),material({id:'m2',stock:5,max_stock:null}),
     material({id:'m3',stock:6}),
     material({id:'m4',stock:0,min_stock:0}),
     material({id:'m5',stock:null})
   ],[]);
   expect(candidates).toHaveLength(2);
   expect(candidates[0]).toMatchObject({
     materialId:id,stock:2,minimum:5,targetQuantity:20,targetTopUp:18,
     shortage:3,preferredSupplier:'Local supplier',referencePrice:12.5
   });
   expect(candidates[1]).toMatchObject({materialId:'m2',targetQuantity:5,
     targetTopUp:0,shortage:0,activeRequest:null});
 });
 it('recognizes active requests without counting closed/cancelled requests as outstanding purchases',()=>{
   const open=request();
   const candidates=deriveReplenishmentCandidates([material()],[
     request({id:'older',status:'CANCELLED'}),open
   ]);
   expect(candidates[0].activeRequest?.id).toBe(rid);
   expect(()=>deriveReplenishmentCandidates([material()],[
     open,request({id:'another',status:'ORDERED'})
   ])).toThrow('Multiple active');
 });
 it('does not fabricate a default purchase quantity for a threshold-only alert',()=>{
   const candidate=deriveReplenishmentCandidates([
     material({stock:5,max_stock:5,supplier:null,vendor:null,price:null})
   ],[])[0];
   expect(candidate.targetTopUp).toBe(0);
   expect(candidate.preferredSupplier).toBeNull();
   expect(candidate.referencePrice).toBeNull();
   const page=read('src/routes/inventory/replenishment/+page.svelte');
   expect(page).toContain('quantity=null;supplier=candidate.preferredSupplier');
   expect(page).toContain('targetNotOrder');
 });
 it('accepts exact validated manager actions and refuses client-selected stock writes',()=>{
   expect(parseReplenishmentChange({
     action:'create',requestId:rid,materialId:id,quantity:10,
     supplierLabel:'Vendor',note:'Shop stock review'
   })).toMatchObject({action:'create',quantity:10,materialId:id});
   expect(parseReplenishmentChange({
     action:'update',requestId:rid,expectedUpdatedAt:saved,
     quantity:20,supplierLabel:'Vendor',note:'Quote updated'
   }).action).toBe('update');
   expect(parseReplenishmentChange({
     action:'order',requestId:rid,expectedUpdatedAt:saved,
     supplierReference:'PO-AT-SUPPLIER-1'
   }).supplierReference).toBe('PO-AT-SUPPLIER-1');
   expect(()=>parseReplenishmentChange({action:'create',requestId:rid,
     materialId:id,quantity:0})).toThrow();
   expect(()=>parseReplenishmentChange({action:'order',requestId:rid,
     expectedUpdatedAt:saved,supplierReference:' '})).toThrow();
   expect(()=>parseReplenishmentChange({action:'close',requestId:rid,
     expectedUpdatedAt:saved,note:'ok'})).toThrow();
   expect(()=>parseReplenishmentChange({action:'order',requestId:rid,
     expectedUpdatedAt:saved,quantity:8,supplierReference:'A'})).toThrow();
   expect(()=>parseReplenishmentChange({action:'create',requestId:rid,
     materialId:id,quantity:2,supplierReference:'Fake supplier order'})).toThrow();
   expect(()=>parseReplenishmentChange({action:'receive',requestId:rid,
     expectedUpdatedAt:saved,quantity:20})).toThrow();
 });
 it('uses one manager-authorized SQL RPC with optimistic revision checks and append-only events',()=>{
   const sql=read('supabase/migrations/20261018000001_inventory_replenishment_requests.sql');
   expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.inventory_replenishment_requests');
   expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.inventory_replenishment_events');
   expect(sql).toContain('inventory_replenishment_one_active_per_material');
   expect(sql).toContain("WHERE status IN ('OPEN','ORDERED')");
   expect(sql).toContain('CREATE OR REPLACE FUNCTION public.oms_manage_inventory_replenishment(');
   expect(sql).toContain("v_role NOT IN ('RD','Boss','HeadOfProduction')");
   expect(sql).toContain('p.is_active=TRUE');
   expect(sql).toContain('v_row.updated_at IS DISTINCT FROM p_expected_updated_at');
   expect(sql).toContain('FROM public.inventory_replenishment_requests');
   expect(sql).toContain('WHERE id=p_request_id FOR UPDATE');
   expect(sql).toContain('v_row.created_by IS DISTINCT FROM v_actor');
   expect(sql).toContain('INSERT INTO public.inventory_replenishment_events(');
   expect(sql).toContain('GRANT SELECT ON public.inventory_replenishment_events TO authenticated');
   expect(sql).toContain('REVOKE ALL ON public.inventory_replenishment_events FROM PUBLIC,anon,authenticated');
   expect(sql).toContain("NOTIFY pgrst,'reload schema'");
 });
 it('blocks marking supplier ordered if old and canonical balances diverge',()=>{
   const sql=read('supabase/migrations/20261018000001_inventory_replenishment_requests.sql');
   expect(sql).toContain("IF v_row.status<>'OPEN'");
   expect(sql).toContain('v_row.supplier_label IS NULL');
   expect(sql).toContain("FROM public.materials\n       WHERE id=v_row.material_id FOR SHARE");
   expect(sql).toContain('FROM public.inventory_items');
   expect(sql).toContain('v_legacy_stock IS DISTINCT FROM v_material.stock');
   expect(sql).toContain('Reconcile inventory parity before ordering');
   expect(sql).toContain('External supplier and order reference required');
   expect(sql).not.toContain('UPDATE public.materials SET stock');
   expect(sql).not.toContain('INSERT INTO public.inventory_movements');
   expect(sql).not.toContain('purchase_order_external_api');
 });
 it('never treats closing a purchasing follow-up as a stock receipt',()=>{
   const sql=read('supabase/migrations/20261018000001_inventory_replenishment_requests.sql');
   expect(sql).toContain("p_action='close' AND v_row.status<>'ORDERED'");
   expect(sql).toContain("status=CASE WHEN p_action='close' THEN 'CLOSED'");
   expect(sql).not.toContain("'RECEIVED'");
   expect(sql).not.toContain('UPDATE public.inventory_items SET stock');
   expect(sql).toContain('audit');
 });
 it('rejects incomplete source reads and protects the HTTP surface, including event history',()=>{
   const api=read('src/routes/api/inventory/replenishment/+server.ts');
   const events=read('src/routes/api/inventory/replenishment/events/+server.ts');
   expect(api).toContain('canManageSharedInventory(locals.user.role)');
   expect(api).toContain('MAX=10000');
   expect(api).toContain("throw error(503,'Replenishment source incomplete')");
   expect(api).toContain('deriveReplenishmentCandidates(');
   expect(api).toContain('parseReplenishmentChange(raw)');
   expect(api).toContain('oms_manage_inventory_replenishment');
   expect(api).toContain("rpcError.code==='P0001'");
   expect(api).toContain("physicalCountVerified:false");
   expect(api).toContain('receiptsAffectStock:false');
   expect(events).toContain('canManageSharedInventory(locals.user.role)');
   expect(events).toContain("'Cache-Control':'private, no-store'");
   expect(events).toContain('truncated:count>200');
 });
 it('provides explicit supplier verification, purchase references and UI permissions',()=>{
   const ui=read('src/routes/inventory/replenishment/+page.svelte');
   const inventory=read('src/routes/inventory/+page.svelte');
   expect(ui).toContain("['RD','Boss','HeadOfProduction']");
   expect(ui).toContain('inventoryReplenishment.workflowCaveat');
   expect(ui).toContain("selectedRequest?.supplier_label");
   expect(ui).toContain('supplierBeforeOrder');
   expect(ui).toContain('expectedUpdatedAt:action');
   expect(ui).toContain('externalReference.trim()');
   expect(ui).toContain('createId=newUuid()');
   expect(ui).toContain("cache:'no-store'");
   expect(ui).toContain('requestMaterials.get(req.material_id)');
   expect(ui).toContain('historyTruncated');
   expect(inventory).toContain('/inventory/replenishment');
 });
 it('keeps all the workflow labels and evidence caveats in EN/RU/LV',()=>{
   const mandatory=['title','stockCaveat','workflowCaveat','minimumRule',
     'supplierBeforeOrder','supplier','quantityRequired','referenceRequired',
     'stale','uncertain','historyPartial','historyUnavailable','saved'];
   for(const lang of ['en','ru','lv']){
     const obj=JSON.parse(read(`src/locales/${lang}.json`)).inventoryReplenishment;
     for(const field of mandatory)expect(typeof obj[field]).toBe('string');
     for(const state of ['OPEN','ORDERED','CLOSED','CANCELLED'])
       expect(typeof obj.status[state]).toBe('string');
     for(const act of ['create','update','order','close','cancel'])
       expect(typeof obj.actionsByKind[act]).toBe('string');
   }
 });
});
