import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateCapacityWrite,dailyStationHours,type ProductionCapacity}
 from '../../src/lib/order/production-capacity';
import {buildCapacityForecast} from '../../src/lib/order/capacity-forecast';
import type {PlanningItem} from '../../src/lib/order/production-planning';
const code=(p:string)=>readFileSync(p,'utf8');
const profile:ProductionCapacity={station:'CNC',workers:1,hours_per_worker:8,
 efficiency_percent:100,workdays:[1,2,3,4,5],updated_at:'2026-10-14T11:00:00Z'};
function item(id:string,hours:number|null,other:Partial<PlanningItem>={}):PlanningItem {
 return {id,station:'CNC',poNumber:id,title:id,client:'Test',
  stageState:'QUEUED',status:'IN_PRODUCTION',dueDate:'2026-10-16',
  priority:'NORMAL',upcoming:false,paused:false,risk:null,
  estimatedHours:hours,actualHours:null,blockedReason:null,...other};
}
describe('OMS-R21 production capacity and forecast',()=>{
 it('requires explicit staffing settings and validates schedule changes',()=>{
  const valid={station:'cnc',workers:2,hoursPerWorker:7.5,
    efficiencyPercent:80,workdays:[1,2,3,4,5],expectedUpdatedAt:null};
  expect(validateCapacityWrite(valid).station).toBe('CNC');
  expect(()=>validateCapacityWrite({...valid,workdays:[1,1,2]})).toThrow();
  expect(()=>validateCapacityWrite({...valid,hoursPerWorker:7.3})).toThrow();
  expect(()=>validateCapacityWrite({...valid,workers:41})).toThrow();
  expect(dailyStationHours({...profile,efficiency_percent:75})).toBe(6);
  expect(dailyStationHours(null)).toBeNull();
 });
 it('allocates known hours across working days without exceeding configured daily hours',()=>{
  const jobs={CNC:[item('A',10,{dueDate:'2026-10-14'}),item('B',4)]};
  const result=buildCapacityForecast(jobs,[profile],'2026-10-14',7);
  expect(result.allocatedHours).toBe(14);
  expect(result.stations.CNC.days[0].allocatedHours).toBe(8);
  expect(result.stations.CNC.days[1].allocatedHours).toBe(6);
  expect(result.late).toBeGreaterThan(0);
  expect(result.stations.CNC.unplanned).toHaveLength(0);
 });
 it('refuses to silently schedule missing, paused or blocked tasks',()=>{
  const jobs={CNC:[item('missing',null),item('blocked',3,{stageState:'BLOCKED'}),
    item('paused',2,{paused:true}),item('ready',4)]};
  const result=buildCapacityForecast(jobs,[profile],'2026-10-14',7);
  expect(result.unplanned).toBe(3);
  expect(result.allocatedHours).toBe(4);
  expect(result.stations.CNC.unplanned.map(x=>x.reason))
    .toEqual(['missingEstimate','blocked','paused']);
 });
 it('does not synthesize capacity for unconfigured stations or treat future work as committed',()=>{
  const jobs={CNC:[item('now',4),item('later',2,{upcoming:true,stageState:'NOT_STARTED'})]};
  const noProfile=buildCapacityForecast(jobs,[],'2026-10-14',7);
  expect(noProfile.availableHours).toBe(0);
  expect(noProfile.unplanned).toBe(1);
  const defaultView=buildCapacityForecast(jobs,[profile],'2026-10-14',7);
  expect(defaultView.allocatedHours).toBe(4);
  const hypothetical=buildCapacityForecast(jobs,[profile],'2026-10-14',7,true);
  expect(hypothetical.allocatedHours).toBe(6);
  expect(hypothetical.tentative).toBeGreaterThan(0);
 });
 it('enforces server roles and DB row-level policies for persisted capacity',()=>{
  const api=code('src/routes/api/production/capacity/+server.ts');
  const sql=code('supabase/migrations/20261014000002_production_station_capacity.sql');
  expect(api).toContain('canManageSharedInventory(locals.user.role)');
  expect(api).toContain(".eq('updated_at',input.expectedUpdatedAt)");
  expect(api).toContain("throw error(409");
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain("'RD','Boss','HeadOfProduction'");
  expect(sql).not.toContain('GRANT DELETE');
 });
 it('uses the client role only to hide edit controls, never imports server-only code',()=>{
  const page=code('src/routes/production/planner/+page.svelte');
  expect(page).not.toContain("from '$lib/server/");
  expect(page).toContain("['RD','Boss','HeadOfProduction'].includes");
  const home=code('src/routes/production/+page.svelte');
  const dashboard=code('src/routes/production/dashboard/+page.svelte');
  expect(home).toContain('/production/planner');
  expect(dashboard).toContain('/production/planner');
 });
 it('renders manager configuration and a non-mutating projection',()=>{
  const page=code('src/routes/production/planner/+page.svelte');
  expect(page).toContain('buildCapacityForecast');
  expect(page).toContain('canConfigure');
  expect(page).toContain('expectedUpdatedAt');
  expect(page).toContain('projection.stations');
  expect(page).not.toContain('/stages?station=');
 });
});
