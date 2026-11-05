import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseStageCompletionRevision,parseStageCompletion}
  from '../../src/lib/order/production-floor-contract';
const read=(path:string)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261016000002_versioned_stage_completion_handoff.sql');
const complete=read('src/routes/api/orders/[id]/stages/[station]/complete/+server.ts');
const workstation=read('src/routes/station/[station]/+page.svelte');
const modal=read('src/lib/components/station/StationCompleteModal.svelte');
const packet=read('src/lib/components/station/StationProductionPacket.svelte');

describe('OMS-R38 — safe stage consumption and accurate handoff',()=>{
 it('requires the version supplied by an actual stage row',()=>{
   expect(parseStageCompletionRevision('2026-10-16T18:50:10.123Z'))
     .toBe('2026-10-16T18:50:10.123Z');
   expect(parseStageCompletionRevision('2026-10-16T18:50:10+03:00'))
     .toBe('2026-10-16T18:50:10+03:00');
   for(const input of [undefined,null,'','yesterday','2026-10-16',4])
     expect(()=>parseStageCompletionRevision(input)).toThrow('revision');
   expect(()=>parseStageCompletionRevision('2026-10-16T18:50:10')).toThrow();
   expect(()=>parseStageCompletion({
     items:[{item_id:'11111111-1111-4111-8111-111111111111',quantity:2}],
     skipped:false
   })).not.toThrow();
 });
 it('checks authenticated station ownership, order status and revision under locks',()=>{
   expect(migration).toContain('p_expected_updated_at TIMESTAMPTZ');
   expect(migration).toContain('auth.uid()');
   expect(migration).toContain("is_active=TRUE");
   expect(migration).toContain("user_id=v_actor AND upper(station_id)=v_station");
   const orderLock=migration.indexOf('WHERE id=p_order_id FOR UPDATE');
   const stageLock=migration.indexOf('WHERE draft_order_id=p_order_id AND station=v_station FOR UPDATE');
   const revision=migration.indexOf('v_stage_updated_at IS DISTINCT FROM p_expected_updated_at');
   const oldRpc=migration.indexOf('SELECT public.complete_stage_with_consumption(');
   expect(orderLock).toBeGreaterThan(0);
   expect(stageLock).toBeGreaterThan(orderLock);
   expect(revision).toBeGreaterThan(stageLock);
   expect(oldRpc).toBeGreaterThan(revision);
   expect(migration).toContain("v_stage_state <> 'IN_PROGRESS'");
   expect(migration).toContain('resolved_at IS NULL');
   expect(migration).toContain('REVOKE ALL ON FUNCTION public.complete_stage_with_consumption(');
   expect(migration).toContain('TO service_role');
   expect(migration).toContain('NOTIFY pgrst, \'reload schema\'');
 });
 it('preserves the atomic original material-consumption implementation',()=>{
   expect(migration).toContain('p_items,p_skipped,p_skip_reason,p_actual_hours,p_notes');
   expect(complete).toContain('p_expected_updated_at:expectedUpdatedAt');
   expect(complete).toContain('parseStageCompletionRevision(body.expectedUpdatedAt)');
   expect(complete).toContain('status:428');
   expect(complete).not.toContain(".from('inventory_items').update");
   expect(complete).not.toContain("consume_materials_for_order', {");
 });
 it('only announces a newly queued station after the locked RPC actually made it queued',()=>{
   expect(migration).toContain("v_next_before='NOT_STARTED' AND v_next_after='QUEUED'");
   expect(migration).toContain("'handoff_queued'");
   expect(complete).toContain('result.handoff_queued===true && result.next_station');
   expect(complete).toContain('handoffStatusKnown:handoffKnown');
   expect(complete).toContain('nextStation: result.handoff_queued===true');
   expect(complete).not.toContain("return json({error:'Completion committed");
 });
 it('keeps stale completion modal entries from changing inventory',()=>{
   expect(workstation).toContain("target.stage?.state!=='IN_PROGRESS'");
   expect(workstation).toContain('expectedUpdatedAt:completeTarget.stage.updated_at');
   expect(workstation).toContain('if(res.status===409 || res.status===428)');
   expect(workstation).toContain('void loadStationOrders(true)');
   expect(workstation).toContain('payload?.handoffQueued===true');
   expect(workstation).toContain("productionExecution.handoffUnknown");
   expect(modal).toContain("productionExecution.reviewReminder");
   expect(modal).toContain('handoffStatusKnown:result.handoffStatusKnown');
 });
 it('checks visibility before exposing consumption views and shows real ledger in native packet',()=>{
   const api=read('src/routes/api/orders/[id]/consumption/+server.ts');
   expect(api).toContain(".from('draft_orders').select('id').eq('id',params.id)");
   expect(api).toContain("Order not found or inaccessible");
   expect(api.indexOf(".from('draft_orders')"))
     .toBeLessThan(api.indexOf(".from('station_consumption_summary')"));
   expect(packet).toContain('/consumption');
   expect(packet).toContain('consumption_skipped_reason');
   expect(packet).toContain('consumptionUnavailable');
   expect(packet).toContain('productionExecution.ledger');
   expect(packet).toContain('productionExecution.ledgerPartial');
   expect(packet).toContain('fetchOrderFilePage<FileRow>(requestedId,0,50');
   expect(packet).toContain('<OrderProfileSheet profiles={order.profiles} />');
   expect(read('src/lib/order/OrderProfileSheet.svelte')).toContain('editable = false');
 });
 it('has production receipt parity across EN/RU/LV',()=>{
   const keys=['declared','skipped','materialSkipRecorded','ledger','ledgerUnavailable',
     'noDeclaredMaterials','ledgerPartial','reviewReminder','handoffUnknown'];
   for(const lang of ['en','ru','lv']){
     const catalog=JSON.parse(read(`src/locales/${lang}.json`)).productionExecution;
     for(const key of keys)
       expect(typeof catalog[key]).toBe('string');
     expect(catalog.declared).toContain('{count}');
   }
 });
});
