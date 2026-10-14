import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseProgressInput,parseStageCompletion} from '../../src/lib/order/production-floor-contract';

const source=(path:string)=>readFileSync(path,'utf8');
const uid='11111111-1111-4111-8111-111111111111';
describe('OMS-R19 production workstation safety',()=>{
 it('accepts bounded progress notes and 0–99%, rejects completion by percentage',()=>{
   expect(parseProgressInput({note:' cut started ',progressPercent:30,expectedUpdatedAt:'2026-10-14T10:15:20Z'}))
     .toMatchObject({note:'cut started',progressPercent:30});
   for(const percent of [-1,100,5.5])
     expect(()=>parseProgressInput({note:'working',progressPercent:percent,expectedUpdatedAt:'2026-10-14T10:15:20Z'})).toThrow();
   expect(()=>parseProgressInput({note:' ',progressPercent:null,expectedUpdatedAt:'2026-10-14T10:15:20Z'})).toThrow();
 });
 it('requires positive whole quantities, no duplicates and explicit skip declaration',()=>{
   const fields={items:[{item_id:uid,quantity:2}],skipped:false,actualHours:1.5,notes:'assembled'};
   expect(parseStageCompletion(fields)).toMatchObject({actualHours:1.5,skipped:false});
   expect(()=>parseStageCompletion({...fields,items:[...fields.items,...fields.items]})).toThrow('Duplicate');
   expect(()=>parseStageCompletion({...fields,items:[{item_id:uid,quantity:0}]})).toThrow();
   expect(()=>parseStageCompletion({items:[],skipped:true,skipReason:'leftover stock'})).not.toThrow();
   expect(()=>parseStageCompletion({...fields,actualHours:1000})).toThrow();
 });
 it('checks stage revision as part of the state and metadata CAS update',()=>{
   const api=source('src/routes/api/orders/[id]/stages/+server.ts');
   expect(api).toContain('throw error(428');
   expect(api).toContain("stage.updated_at !== expectedUpdatedAt");
   expect(api).toContain(".eq('updated_at', expectedUpdatedAt)");
   expect(api).toContain("if (!stage.started_at)");
   expect(api).toContain("stage.state === 'COMPLETED'");
 });
 it('protects progress with stage access and status checks and server-fixed action',()=>{
   const api=source('src/routes/api/station/[station]/orders/[id]/progress/+server.ts');
   expect(api).toContain('canOperateStation(locals.user,station)');
   expect(api).toContain("stage.state!=='IN_PROGRESS'");
   expect(api).toContain("p_action:'PROGRESS_UPDATE'");
   expect(api).toContain("stage.updated_at!==data.expectedUpdatedAt");
   expect(api).toContain("details->>order_id");
 });
 it('does not move inventory outside the atomic completion RPC',()=>{
   const api=source('src/routes/api/orders/[id]/stages/[station]/complete/+server.ts');
   expect(api).toContain("complete_stage_with_consumption");
   expect(api).toContain('parseStageCompletion(body)');
   expect(api).not.toContain(".from('inventory_items').update");
 });
 it('wires R19 to workstation, overview and store and retains failed form data',()=>{
   const board=source('src/routes/station/[station]/+page.svelte');
   expect(board).toContain('<StationProgressPanel');
   expect(board).toContain('expectedUpdatedAt:stageRow.updated_at');
   expect(board).toContain("productionFloor.handoff");
   const panel=source('src/lib/components/station/StationProgressPanel.svelte');
   expect(panel).toContain("if(!res.ok)throw new Error");
   expect(panel).toContain("note='';progressPercent=undefined;saved=true");
   expect(source('src/routes/orders/[id]/+page.svelte')).toContain('expectedUpdatedAt: stageRow.updated_at');
   expect(source('src/lib/stores/orderDetail.ts')).toContain('expectedUpdatedAt');
 });
 it('has translations for the actual operational controls',()=>{
   for(const lang of ['en','ru','lv']){
     const messages=JSON.parse(source(`src/locales/${lang}.json`)).productionFloor;
     expect(messages.logProgress).toBeTruthy();
     expect(messages.handoff).toContain('{station}');
   }
 });
});
