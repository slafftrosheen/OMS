import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {deriveProductionPlanning,dueInDays,type OrderRow,type StageRow}
 from '../../src/lib/order/production-planning';
const read=(path:string)=>readFileSync(path,'utf8');
const orders:OrderRow[]=[
 {id:'one',status:'IN_PRODUCTION',due_date:'2026-10-13',priority:'HIGH'},
 {id:'two',status:'CONFIRMED',due_date:'2026-10-17',priority:'NORMAL'},
 {id:'three',status:'PENDING_REVIEW',due_date:'2026-10-12'},
 {id:'four',status:'ON_HOLD',due_date:'2026-10-11'}];
const stages:StageRow[]=[
 {draft_order_id:'one',station:'CNC',state:'IN_PROGRESS',estimated_hours:3},
 {draft_order_id:'one',station:'PAINT',state:'NOT_STARTED'},
 {draft_order_id:'two',station:'CNC',state:'QUEUED'},
 {draft_order_id:'two',station:'PACKAGING',state:'BLOCKED',estimated_hours:2},
 {draft_order_id:'two',station:'CAD',state:'COMPLETED',estimated_hours:4},
 {draft_order_id:'three',station:'PAINT',state:'QUEUED'},
 {draft_order_id:'four',station:'EDGE',state:'QUEUED'}];
describe('OMS-R20 production-planning contracts',()=>{
 it('keeps per-order per-station assignments without treating upcoming as active',()=>{
   const view=deriveProductionPlanning(orders,stages,'2026-10-14');
   expect(view.totals.orders).toBe(3);
   expect(view.totals.activeAssignments).toBe(4);
   expect(view.totals.upcoming).toBe(1);
   expect(view.stations.CNC.map(x=>x.id)).toEqual(['one','two']);
   expect(view.stations.CAD).toHaveLength(0);
   expect(view.stations.PAINT.map(x=>x.id)).toEqual(['one']);
 });
 it('separates overdue, approaching, paused and missing-hour data',()=>{
   const view=deriveProductionPlanning(orders,stages,'2026-10-14');
   expect(view.totals.overdue).toBe(1);
   expect(view.totals.dueSoon).toBe(2);
   expect(view.totals.blocked).toBe(1);
   expect(view.totals.paused).toBe(1);
   expect(view.totals.knownHours).toBe(5);
   expect(view.totals.missingEstimates).toBe(2);
   expect(view.workload.PACKAGING.pressure).toBe('blocked');
   expect(view.alerts[0].risk).toBe('blocked');
   expect(view.stations.EDGE[0].risk).toBe('onHold');
 });
 it('verifies pressure labels and dashboard links from object-based assignments',()=>{
   const station=read('src/lib/components/production/StationBoard.svelte');
   const board=read('src/routes/production/+page.svelte');
   const dashboard=read('src/routes/production/dashboard/+page.svelte');
   expect(station).toContain("summary.pressure!=='normal'");
   expect(station).toContain('summary.missingEstimates>0');
   expect(board).toContain('showUpcoming');
   expect(board).toContain('attentionOnly');
   expect(dashboard).toContain('data.totals.inProgress');
   expect(dashboard).toContain("'stationId' in entry");
   expect(dashboard).not.toContain('data.in_progress ?? 0');
 });
 it('compares calendar dates rather than converting UTC timestamps',()=>{
   expect(dueInDays('2026-11-01','2026-10-31')).toBe(1);
   expect(dueInDays('2026-10-13','2026-10-14')).toBe(-1);
   expect(dueInDays('2026-02-30','2026-02-28')).toBeNull();
 });
 it('localizes planning alerts for all supported interface languages',()=>{
   for(const language of ['en','ru','lv']){
     const labels=JSON.parse(read(`src/locales/${language}.json`)).productionPlanning;
     expect(labels.risk.overdue).toBeTruthy();
     expect(labels.pressure.backlog).toBeTruthy();
     expect(labels.stationMissing).toContain('{count}');
   }
 });
 it('replaces current_station dependency and explicitly paginates the canonical data',()=>{
   const api=read('src/routes/api/production/board/+server.ts');
   expect(api).toContain(".from('draft_orders')");
   expect(api).toContain(".from('order_stages')");
   expect(api).not.toContain('current_station');
   expect(api).not.toContain("from('ordersummary')");
   expect(api).toContain('.range(offset,offset+PAGE_SIZE-1)');
   expect(api).toContain('STAGE_ID_CHUNK=50');
   expect(api).toContain("'Cache-Control':'private, no-store'");
 });
});
