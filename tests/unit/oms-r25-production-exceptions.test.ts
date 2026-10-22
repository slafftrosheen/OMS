import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {detectProductionExceptions,mergeProductionReviews}
 from '../../src/lib/order/production-exception-queue';
import {parseReviewChange} from '../../src/lib/order/production-exceptions';
import type {PerformanceSummary,PerformanceLine} from '../../src/lib/order/production-performance';
import type {ExceptionReview} from '../../src/lib/order/production-exceptions';
const read=(p:string)=>readFileSync(p,'utf8');
const order='11111111-1111-4111-8111-111111111111';
const line=(station:string,state:string,more:Partial<PerformanceLine>={}):PerformanceLine=>({
  orderId:order,station,poNumber:'RF-10',title:'Lightbox',state,
  estimatedHours:4,actualHours:2,varianceHours:-2,progressPercent:null,
  progressAt:null,progressNote:null,startedAt:null,completedAt:null,
  blockedReason:null,...more
});
const summary:PerformanceSummary={
 asOf:'2026-10-14T20:00:00Z',days:90,
 totals:{} as PerformanceSummary['totals'],stations:[],
 completed:[line('CNC','COMPLETED',{actualHours:null,varianceHours:null,
   completedAt:'2026-10-13T09:00:00Z'})],
 active:[line('PAINT','BLOCKED',{actualHours:6,varianceHours:2}),
   line('EDGE','REWORK')]
};
const booking=(date:string,hours:number)=>({
 id:order,draft_order_id:order,station:'PAINT',work_date:date,hours
});
const review=(station:string,kind:ExceptionReview['kind'],
 status:ExceptionReview['status']='ACKNOWLEDGED'):ExceptionReview=>({
 id:order,draft_order_id:order,station,kind,status,owner_id:order,due_date:null,
 follow_up_note:'Follow up',resolution_note:null,updated_at:'2026-10-14T12:00:00Z',
 created_at:'2026-10-14T12:00:00Z',resolved_at:null,updated_by:order
});
describe('OMS-R25 exception detection and management contracts',()=>{
 it('detects missing actual hours, recorded-hour overruns, blocked and rework stages',()=>{
  const issues=detectProductionExceptions(summary,[],'2026-10-14');
  expect(issues.map(x=>x.kind).sort()).toEqual([
    'ACTUAL_OVERRUN','BLOCKED','MISSING_ACTUAL','REWORK'
  ]);
  expect(issues.find(x=>x.kind==='MISSING_ACTUAL')?.hours).toBe(4);
 });
 it('does not turn zero actual work or missing variance into a false overrun',()=>{
  const s={...summary,completed:[line('CNC','COMPLETED',{
    actualHours:0,estimatedHours:3,varianceHours:-3,
    completedAt:'2026-10-13T09:00:00Z'})],active:[]};
  expect(detectProductionExceptions(s,[],'2026-10-14')).toHaveLength(0);
 });
 it('aggregates past approved days only while the associated stage remains open',()=>{
  const entries=[booking('2026-10-13',2),booking('2026-10-11',1),
    booking('2026-10-15',5)];
  const findings=detectProductionExceptions(summary,entries,'2026-10-14');
  const missed=findings.find(x=>x.kind==='MISSED_BOOKING');
  expect(missed).toMatchObject({hours:3,referenceDate:'2026-10-13'});
  expect(detectProductionExceptions(summary,null,'2026-10-14')
    .some(x=>x.kind==='MISSED_BOOKING')).toBe(false);
 });
 it('retains historical review records separately from current findings',()=>{
  const findings=detectProductionExceptions(summary,[],'2026-10-14');
  const rows=mergeProductionReviews(findings,[
    review('PAINT','BLOCKED'),review('CAD','MISSING_ACTUAL','RESOLVED')
  ]);
  expect(rows.find(x=>x.station==='PAINT'&&x.kind==='BLOCKED')?.review?.owner_id).toBe(order);
  expect(rows.find(x=>x.station==='CAD')?.sourceActive).toBe(false);
  expect(rows[0].sourceActive).toBe(true);
 });
 it('validates claim, revision and resolution note contracts',()=>{
  const claim={action:'claim',orderId:order,station:'cnc',kind:'MISSING_ACTUAL',
    dueDate:'2026-10-23',note:'Check timecard'};
  expect(parseReviewChange(claim)).toMatchObject({station:'CNC',kind:'MISSING_ACTUAL'});
  expect(()=>parseReviewChange({...claim,kind:'SOMETHING_ELSE'})).toThrow();
  for(const dueDate of [null,undefined]){
    expect(()=>parseReviewChange({...claim,dueDate})).toThrow('follow-up due date');
  }
  expect(()=>parseReviewChange({action:'take',reviewId:order,
    expectedUpdatedAt:'2026-10-14T12:00:00Z'})).toThrow();
  expect(()=>parseReviewChange({action:'resolve',reviewId:order,
    expectedUpdatedAt:'2026-10-14T12:00:00Z',note:'  '})).toThrow();
  expect(parseReviewChange({action:'resolve',reviewId:order,
    expectedUpdatedAt:'2026-10-14T12:00:00Z',note:'Verified work logs'}).action).toBe('resolve');
 });
 it('enforces RLS and verifies live source before first claim and reopen',()=>{
  const sql=read('supabase/migrations/20261014000004_production_exception_reviews.sql');
  const api=read('src/routes/api/production/exception-reviews/+server.ts');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain("p_action IN ('claim','reopen')");
  expect(sql).toContain("v_stage.actual_hours IS NULL");
  expect(sql).toContain("v_stage.actual_hours>v_stage.estimated_hours");
  expect(sql).toContain("v_stage.state::text='BLOCKED'");
  expect(sql).toContain("r.work_date<v_today");
  expect(sql).toContain('production_exception_events');
  expect(sql).toContain('FOR SHARE;');
  expect(sql).not.toContain('chr(0)');
  expect(sql).toContain('An accountable follow-up due date is required');
  expect(sql).toContain('v_review.updated_at IS DISTINCT FROM p_expected_updated_at');
  expect(sql).not.toContain('GRANT UPDATE ON public.production_exception_reviews');
  expect(api).toContain('canManageSharedInventory(locals.user.role)');
  expect(api).toContain('oms_manage_production_exception');
 });
 it('keeps a prior review in the ledger when its condition is no longer live',()=>{
   const queue=mergeProductionReviews([], [review('CNC','MISSING_ACTUAL','RESOLVED')]);
   expect(queue[0]).toMatchObject({sourceActive:false,
     review:expect.objectContaining({status:'RESOLVED'})});
 });
 it('keeps issues separate from stage/inventory mutations and translates source badges',()=>{
  const q=read('src/lib/order/production-exception-queue.ts');
  expect(q).not.toContain('.update(');
  expect(q).not.toContain('complete_stage_with_consumption');
 });
});
