import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {computeProductionPerformance,type PerformanceOrder,type PerformanceStage,
  type ProgressObservation} from '../../src/lib/order/production-performance';

const load=(p:string)=>readFileSync(p,'utf8');
const orders:PerformanceOrder[]=[
 {id:'active',po_number:'RF-11',title:'Neon sign',status:'IN_PRODUCTION'},
 {id:'historic',po_number:'RF-12',title:'Panels',status:'ARCHIVED'},
 {id:'unknown',po_number:'RF-13',title:'Letters',status:'IN_PRODUCTION'}
];
const recent='2026-10-13T12:00:00+03:00',asOf='2026-10-14T17:00:00Z';
const stages:PerformanceStage[]=[
 {draft_order_id:'historic',station:'CNC',state:'COMPLETED',estimated_hours:3,actual_hours:5,
  completed_at:recent},
 {draft_order_id:'unknown',station:'PAINT',state:'COMPLETED',estimated_hours:2,actual_hours:null,
  completed_at:'2026-10-13T13:00:00Z'},
 {draft_order_id:'unknown',station:'ASSEMBLY',state:'COMPLETED',estimated_hours:null,actual_hours:4,
  completed_at:'2026-10-13T14:00:00Z'},
 {draft_order_id:'active',station:'CNC',state:'IN_PROGRESS',estimated_hours:4,actual_hours:1.5},
 {draft_order_id:'active',station:'PAINT',state:'BLOCKED',estimated_hours:2,actual_hours:3}
];
const observations:ProgressObservation[]=[
 {orderId:'active',station:'CNC',createdAt:'2026-10-12T12:00:00Z',progressPercent:15,note:'Cut started'},
 {orderId:'active',station:'CNC',createdAt:'2026-10-13T12:00:00+03:00',progressPercent:35,note:'Cut ongoing'},
 {orderId:'active',station:'CNC',createdAt:'2026-10-13T09:30:00Z',progressPercent:50,note:'Latest'},
 {orderId:'active',station:'PAINT',createdAt:'2026-10-13T10:00:00Z',progressPercent:null,note:'Blocked'}
];
describe('OMS-R24 actual-versus-planned production',()=>{
 it('counts archived completions and never substitutes zero for missing actual hours',()=>{
   const result=computeProductionPerformance(orders,stages,observations,asOf,30);
   expect(result.totals).toMatchObject({completed:3,completedWithActual:2,
     completedMissingActual:1,completedComparable:1,overEstimate:1,
     completedEstimatedHours:3,completedMatchedActualHours:5,
     completedActualHours:9,completedVarianceHours:2});
   expect(result.completed[0].orderId).toBe('unknown');
   expect(result.completed.find(x=>x.station==='PAINT')?.actualHours).toBeNull();
 });
 it('shows current WIP and the latest self-reported progress without deriving hours',()=>{
   const result=computeProductionPerformance(orders,stages,observations,asOf,30);
   expect(result.totals).toMatchObject({active:2,activeWithActual:2,
     activeReportedProgress:1,activeHoursOverEstimate:1});
   const cnc=result.active.find(x=>x.station==='CNC')!;
   expect(cnc).toMatchObject({actualHours:1.5,estimatedHours:4,
     progressPercent:50,progressNote:'Latest'});
   const paint=result.active.find(x=>x.station==='PAINT')!;
   expect(paint.progressPercent).toBeNull();
   expect(paint.progressNote).toBe('Blocked');
 });
 it('separates comparable stages from all actual-hour records at station level',()=>{
   const result=computeProductionPerformance(orders,stages,[],asOf,30);
   const cnc=result.stations.find(x=>x.station==='CNC')!;
   expect(cnc).toMatchObject({completed:1,comparable:1,estimatedHours:3,
     actualHours:5,varianceHours:2,active:1});
   const assembly=result.stations.find(x=>x.station==='ASSEMBLY')!;
   expect(assembly).toMatchObject({completed:1,comparable:0,missingActual:0,
     estimatedHours:0,actualHours:0});
 });
 it('respects time windows and timezone offsets',()=>{
   const onlyCompleted:PerformanceStage[]=[
     {draft_order_id:'historic',station:'CNC',state:'COMPLETED',estimated_hours:1,
      actual_hours:0,completed_at:'2026-10-06T14:00:00+03:00'}
   ];
   expect(computeProductionPerformance(orders,onlyCompleted,[],asOf,7).totals.completed).toBe(0);
   expect(computeProductionPerformance(orders,onlyCompleted,[],asOf,30).totals.completed).toBe(1);
   expect(computeProductionPerformance(orders,onlyCompleted,[],asOf,30)
     .completed[0].actualHours).toBe(0);
 });
 it('uses a bounded, RLS-backed production query and reports incomplete progress as an error',()=>{
   const api=load('src/routes/api/production/performance/+server.ts');
   expect(api).toContain(".from('draft_orders')");
   expect(api).toContain(".from('order_stages')");
   expect(api).toContain(".from('station_timeline')");
   expect(api).toContain(".eq('action','PROGRESS_UPDATE')");
   expect(api).toContain(".in('details->>order_id',ids)");
   expect(api).toContain('count>=LOG_LIMIT');
   expect(api).toContain(".eq('state','COMPLETED')");
   expect(api).toContain("if(!locals.user)throw error(401");
   expect(api).toContain("'Cache-Control':'private, no-store'");
 });
 it('connects the measured performance page to production navigation',()=>{
   const page=load('src/routes/production/performance/+page.svelte');
   expect(page).toContain("days=$state<7|30|90>(30)");
   expect(page).toContain('completedMatchedActualHours');
   expect(page).toContain('row.progressAt');
   expect(load('src/routes/production/+page.svelte')).toContain('/production/performance');
   expect(load('src/routes/production/dashboard/+page.svelte')).toContain('/production/performance');
 });
 it('translates measurement caveats into EN, RU and LV',()=>{
   for(const lang of ['en','ru','lv']){
     const t=JSON.parse(load(`src/locales/${lang}.json`)).productionPerformance;
     expect(t.disclaimer.length).toBeGreaterThan(50);
     expect(t.missingActual).toBeTruthy();
     expect(t.progressCoverage).toBeTruthy();
   }
 });
});
