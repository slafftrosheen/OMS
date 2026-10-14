import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildCapacityForecast,type ApprovedReservationHours}
  from '../../src/lib/order/capacity-forecast';
import {reconcileProductionSchedule} from '../../src/lib/order/schedule-drift';
import type {PlanningItem} from '../../src/lib/order/production-planning';
import type {ProductionCapacity} from '../../src/lib/order/production-capacity';

const src=(path:string)=>readFileSync(path,'utf8');
const config:ProductionCapacity={station:'CNC',workers:1,hours_per_worker:8,
  efficiency_percent:100,workdays:[1,2,3,4,5],updated_at:'2026-10-14T10:00:00Z'};
function task(id:string,estimatedHours:number|null,extra:Partial<PlanningItem>={}):PlanningItem{
  return {id,station:'CNC',poNumber:id,title:'Sign',client:'Example',dueDate:'2026-10-20',
    priority:'NORMAL',status:'IN_PRODUCTION',stageState:'QUEUED',upcoming:false,
    paused:false,risk:null,estimatedHours,actualHours:null,blockedReason:null,...extra};
}
function booked(id:string,orderId:string,date:string,hours:number):ApprovedReservationHours{
  return {id,draft_order_id:orderId,station:'CNC',work_date:date,hours};
}
describe('OMS-R23 reconciliation of approved capacity and stage work',()=>{
 it('subtracts station-day hours and stage-approved hours without double booking',()=>{
   const source={CNC:[task('A',9),task('B',4)]};
   const approved=[
     booked('r1','A','2026-10-15',3),
     booked('r2','B','2026-10-14',2)
   ];
   const forecast=buildCapacityForecast(source,[config],'2026-10-14',7,false,approved);
   expect(forecast.committedHours).toBe(5);
   expect(forecast.allocatedHours).toBe(8);
   expect(forecast.stations.CNC.days[0]).toMatchObject({
     capacityHours:8,committedHours:2,freeHours:6,allocatedHours:6
   });
   expect(forecast.stations.CNC.days[1]).toMatchObject({
     capacityHours:8,committedHours:3,freeHours:5,allocatedHours:2
   });
   for(const day of forecast.stations.CNC.days)
     expect(day.allocatedHours+day.committedHours).toBeLessThanOrEqual(day.capacityHours);
 });
 it('subtracts approved stage work outside the visible horizon',()=>{
   const forecast=buildCapacityForecast({CNC:[task('A',7)]},[config],
     '2026-10-14',7,false,[booked('future','A','2026-11-16',3)]);
   expect(forecast.committedHours).toBe(0);
   expect(forecast.allocatedHours).toBe(4);
 });
 it('does not mistake a missed historical booking for completed work',()=>{
   const forecast=buildCapacityForecast({CNC:[task('A',7)]},[config],
     '2026-10-14',7,false,[booked('old','A','2026-10-13',3)]);
   expect(forecast.allocatedHours).toBe(7);
   expect(forecast.committedHours).toBe(0);
   expect(reconcileProductionSchedule({CNC:[task('A',7)]},[config],
     [booked('old','A','2026-10-13',3)],'2026-10-14')
       .map(x=>x.reason)).toContain('pastCommitment');
 });
 it('flags an already overbooked station-day without adding more suggested work',()=>{
   const forecast=buildCapacityForecast({CNC:[task('A',20)]},[config],
     '2026-10-14',7,false,[booked('r1','A','2026-10-14',10)]);
   expect(forecast.overbookedDays).toBe(1);
   expect(forecast.stations.CNC.days[0]).toMatchObject({
     committedHours:10,freeHours:0,overbookedHours:2,allocatedHours:0
   });
 });
 it('flags blocked, paused, overdue, revised-estimate, and capacity drift',()=>{
   const source={CNC:[
     task('blocked',3,{stageState:'BLOCKED'}),
     task('paused',3,{paused:true,status:'ON_HOLD'}),
     task('revision',1,{actualHours:3})
   ]};
   const bookings=[
     booked('a','blocked','2026-10-13',1),
     booked('b','paused','2026-10-16',2),
     booked('c','revision','2026-10-15',2),
     booked('d','unavailable','2026-10-16',7)
   ];
   const drift=reconcileProductionSchedule(source,[config],bookings,'2026-10-14');
   const reasons=new Set(drift.map(x=>x.reason));
   for(const reason of ['blockedCommitment','pausedCommitment','pastCommitment',
       'estimateExceeded','actualOverEstimate','capacityExceeded','stageUnavailable'])
     expect(reasons.has(reason)).toBe(true);
   expect(drift.find(x=>x.reason==='capacityExceeded')?.hours).toBe(1);
 });
 it('flags actual hours overruns even if no reservation exists',()=>{
   const drift=reconcileProductionSchedule({CNC:[task('no-booking',2,{actualHours:3})]},
      [config],[],'2026-10-14');
   expect(drift).toEqual([expect.objectContaining({
     reason:'actualOverEstimate',orderId:'no-booking',hours:1
   })]);
 });
 it('returns historical approved entries without treating completed stages as future drift',()=>{
   const drift=reconcileProductionSchedule({},[config],
     [booked('old','completed','2026-10-10',2)],'2026-10-14');
   expect(drift).toEqual([]);
 });
 it('fails closed if the complete approved snapshot cannot be read',()=>{
   const api=src('src/routes/api/production/commitments/+server.ts');
   expect(api).toContain(".eq('status','APPROVED')");
   expect(api).toContain("count:'exact'");
   expect(api).toContain(".order('id',{ascending:true})");
   expect(api).toContain('rows.length!==expectedTotal');
   expect(api).toContain("Cache-Control':'private, no-store'");
   const page=src('src/routes/production/planner/+page.svelte');
   expect(page).toContain('stages&&commitmentsReady');
   expect(page).toContain('loadCommitmentSnapshot');
   expect(page).toContain('onChanged={refreshCommitments}');
   expect(page).toContain('d.tasks.length>0||d.committedHours>0');
   const panel=src('src/lib/components/production/ProductionReservationPanel.svelte');
   expect(panel).toContain('canEdit&&ledgerReady&&!loading');
   expect(panel).toContain('onChanged()');
 });
 it('localizes reconciliation indicators for EN RU LV',()=>{
   for(const lang of ['en','ru','lv']){
     const copy=JSON.parse(src(`src/locales/${lang}.json`)).scheduleReconciliation;
     expect(copy.reason.capacityExceeded).toBeTruthy();
     expect(copy.daySummary).toContain('{booked}');
     expect(copy.snapshotFailed).toBeTruthy();
   }
 });
});
