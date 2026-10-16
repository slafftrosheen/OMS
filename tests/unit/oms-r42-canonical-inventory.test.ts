import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {classifyInventoryParity} from '../../src/lib/inventory/consistency';
import {parseStageCompletionRevision} from '../../src/lib/order/production-floor-contract';

const read=(path:string)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261016000005_canonical_inventory_consumption.sql');

describe('OMS-R42 — canonical inventory, mirrored stock, explicit reconciliation',()=>{
 it('classifies matching, divergent, canonical-only and ambiguous legacy balances without choosing a winner',()=>{
   const materials=[
     {id:'a',sku:'S1',name_en:'One',stock:10},
     {id:'b',sku:'S2',name_en:'Two',stock:5},
     {id:'c',sku:'S3',name_en:'Three',stock:1},
     {id:'d',sku:'S4',name_en:'Four',stock:0},
     {id:'e',sku:'S5',name_en:'Five',stock:null}
   ];
   const legacy=[
     {id:'a1',material_id:'a',stock:10,sku:'S1'},
     {id:'b1',material_id:'b',stock:20,sku:'S2'},
     {id:'d1',material_id:'d',stock:0,sku:'S4'},
     {id:'d2',material_id:'d',stock:0,sku:'S4'},
     {id:'e1',material_id:'e',stock:3,sku:'S5'},
     {id:'orphan',material_id:null,stock:2,sku:'S6'}
   ];
   const actual=classifyInventoryParity(materials,legacy);
   expect(actual.map(x=>x.state))
     .toEqual(['MATCH','DIVERGENT','CANONICAL_ONLY','AMBIGUOUS','INVALID']);
   expect(actual[1]).toMatchObject({canonicalStock:5,legacyStock:20,linkedCount:1});
   expect(actual[2]).toMatchObject({legacyStock:null,legacyItemId:null});
   expect(actual[3].linkedCount).toBe(2);
 });
 it('validates real stage revision timestamps instead of literal backslash sequences',()=>{
   expect(parseStageCompletionRevision('2026-10-16T10:20:30.123Z'))
     .toBe('2026-10-16T10:20:30.123Z');
   expect(parseStageCompletionRevision('2026-10-16T10:20:30+03:00'))
     .toBe('2026-10-16T10:20:30+03:00');
   expect(()=>parseStageCompletionRevision('not-a-timestamp')).toThrow('revision');
   const source=read('src/lib/order/production-floor-contract.ts');
   expect(source).toContain(String.raw`/^\d{4}-\d{2}`);
   expect(source).not.toContain(String.raw`/^\\d{4}-\\d{2}`);
 });
 it('keeps original R38 stage guards and validates canonical balances before material deduction',()=>{
   expect(migration).toContain('CREATE OR REPLACE FUNCTION public.complete_stage_with_consumption(');
   expect(migration).toContain("v_stage_state NOT IN ('IN_PROGRESS','REWORK')");
   expect(migration).toContain('FROM public.materials\n          WHERE id=v_material_id FOR UPDATE');
   expect(migration).toContain("Legacy and canonical stock differ; manager reconciliation required");
   expect(migration).toContain('v_material_id=ANY(v_seen_materials)');
   expect(migration).toContain('FROM public.inventory_items WHERE material_id=v_material_id FOR UPDATE');
   expect(migration).toContain("v_legacy_count>1");
   expect(migration).toContain('public.consume_materials_for_order(p_order_id, p_station, p_items, v_actor)');
   const versioned=read('supabase/migrations/20261016000002_versioned_stage_completion_handoff.sql');
   expect(versioned).toContain('p_expected_updated_at TIMESTAMPTZ');
   expect(versioned).toContain("v_stage_state <> 'IN_PROGRESS'");
   expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION public.complete_stage_with_consumption(\n UUID,TEXT,JSONB,BOOLEAN,TEXT,NUMERIC,TEXT\n) TO authenticated');
 });
 it('updates canonical and mapped legacy stock in one audited transaction',()=>{
   const helper=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.consume_materials_for_order('),
     migration.indexOf('CREATE OR REPLACE FUNCTION public.complete_stage_with_consumption('));
   expect(helper).toContain('FROM public.materials WHERE id=v_material_id FOR UPDATE');
   expect(helper).toContain('FROM public.inventory_items WHERE material_id=v_material_id FOR UPDATE');
   expect(helper).toContain('IF v_legacy_stock IS DISTINCT FROM v_stock');
   expect(helper).toContain('UPDATE public.materials SET stock=v_after');
   expect(helper).toContain('UPDATE public.inventory_items SET stock=v_after');
   expect(helper).toContain('INSERT INTO public.inventory_movements(');
   expect(helper).toContain('material_id,item_id,movement_type,quantity');
   expect(helper).toContain('legacy_stock_before');
   expect(helper).toContain('v_material_id=ANY(v_seen_materials)');
   expect(helper).toContain("'station='||upper(btrim(p_station))");
   expect(helper).toContain("v_stock<v_quantity");
   expect(helper).not.toContain('GREATEST(stock - v_qty, 0)');
 });
 it('keeps manual IN/OUT parity-checked while allowing explicit audited physical ADJUST',()=>{
   expect(migration).toContain('CREATE OR REPLACE FUNCTION public.oms_record_manual_inventory_movement(');
   expect(migration).toContain("IF v_kind<>'ADJUST' AND v_legacy_id IS NOT NULL");
   expect(migration).toContain('v_legacy_stock IS DISTINCT FROM v_stock_before');
   expect(migration).toContain('UPDATE public.inventory_items SET stock=v_stock_after');
   expect(migration).toContain('stock_before,stock_after,legacy_stock_before');
   expect(migration).toContain('p_request_id');
   expect(migration).toContain("'idempotent',TRUE");
   expect(migration).toContain('CREATE OR REPLACE FUNCTION public.oms_reconcile_inventory_stock(');
   expect(migration).toContain('p_expected_canonical_stock INTEGER,p_expected_legacy_stock INTEGER');
   expect(migration).toContain('v_canonical IS DISTINCT FROM p_expected_canonical_stock');
   expect(migration).toContain('v_legacy IS DISTINCT FROM p_expected_legacy_stock');
   expect(migration).toContain("'ADJUST',p_new_stock,p_reason");
   expect(migration).toContain('NOTIFY pgrst');
 });
 it('uses manager-only, paginated, complete parity coverage without stock mutations',()=>{
   const api=read('src/routes/api/inventory/consistency/+server.ts');
   expect(api).toContain('canManageSharedInventory(locals.user.role)');
   expect(api).toContain("const PAGE_LIMIT=50");
   expect(api).toContain('classifyInventoryParity(materials,legacy)');
   expect(api).toContain(".is('material_id',null)");
   expect(api).toContain('result.count>500');
   expect(api).toContain('p_expected_canonical_stock:body.expectedCanonicalStock');
   expect(api).toContain('p_expected_legacy_stock:body.expectedLegacyStock');
   expect(api).toContain('oms_reconcile_inventory_stock');
   expect(api).not.toContain(".from('materials').update");
 });
 it('makes manager choose the physical count and produces a traceable receipt',()=>{
   const ui=read('src/routes/inventory/consistency/+page.svelte');
   expect(ui).toContain("['RD','Boss','HeadOfProduction']");
   expect(ui).toContain("row.state==='DIVERGENT'");
   expect(ui).toContain("bind:value={physicalCount}");
   expect(ui).toContain('explanation.trim().length<10');
   expect(ui).toContain('expectedCanonicalStock:target.canonicalStock');
   expect(ui).toContain('expectedLegacyStock:target.legacyStock');
   expect(ui).toContain('requestId=randomId()');
   expect(ui).toContain('attemptPayload!==fingerprint');
   expect(ui).toContain('result.receipt.id');
   expect(ui).toContain('inventoryConsistency.countFirst');
   const index=read('src/routes/inventory/+page.svelte');
   expect(index).toContain('/inventory/consistency');
 });
 it('localizes parity, ambiguous mapping warnings and physical count across all languages',()=>{
   const keys=['title','subtitle','warning','reconcile','unmappedAction',
     'physicalCount','reason','stale','retry','partial','countFirst'];
   for(const lang of ['en','ru','lv']){
     const obj=JSON.parse(read(`src/locales/${lang}.json`)).inventoryConsistency;
     for(const key of keys)expect(typeof obj[key]).toBe('string');
     for(const state of ['MATCH','DIVERGENT','CANONICAL_ONLY','AMBIGUOUS','INVALID'])
       expect(typeof obj.states[state]).toBe('string');
   }
 });
});
