import { describe, it, expect } from 'vitest';
import { GET as analytics } from '../../src/routes/api/analytics/+server';
import { GET as overview } from '../../src/routes/api/orders/analytics/+server';
import { GET as logistics } from '../../src/routes/api/logistics/metrics/+server';
import { dateRangeForTimeframe } from '../../src/lib/server/api-contracts';
const now=new Date().toISOString();
const orders=[{id:'a',status:'IN_PRODUCTION',client:'TEST',created_at:now,updated_at:now,due_date:'2020-01-01'},
 {id:'b',status:'DISPATCHED',client:'TEST',created_at:now,updated_at:now,dispatched_at:now}];
function event(path:string,fail=false): any {
 return {url:new URL(`http://localhost${path}`),locals:{user:{id:'user',role:'Boss'},supabase:{from(table:string){
  const q:any={select(fields:string){if(fields.includes('completed_at'))throw new Error('No such order column');return q;},order(){return q;},gte(){return q;},lt(){return q;},lte(){return q;},range(){
   return Promise.resolve({data:table==='draft_orders'?orders:table==='order_stages'?[{id:'stage',draft_order_id:'a',station:'CNC',state:'IN_PROGRESS'}]:[],error:fail?{code:'offline'}:null});}};return q;
 }}}};
}
describe('dashboard endpoint contracts',()=>{
 it('includes the current Riga day on both sides of local midnight',()=>{
  expect(dateRangeForTimeframe('7d',new Date('2026-11-10T21:59:00Z'))).toEqual({from:'2026-11-03',to:'2026-11-10'});
  expect(dateRangeForTimeframe('7d',new Date('2026-11-10T22:01:00Z'))).toEqual({from:'2026-11-04',to:'2026-11-11'});
  expect(dateRangeForTimeframe('30d',new Date('2026-06-30T21:01:00Z'))).toEqual({from:'2026-06-01',to:'2026-07-01'});
 });
 it('subtracts calendar days across Riga daylight-saving changes without drifting a day',()=>{
  expect(dateRangeForTimeframe('7d',new Date('2026-03-29T22:30:00Z'))).toEqual({from:'2026-03-23',to:'2026-03-30'});
  expect(dateRangeForTimeframe('7d',new Date('2026-10-25T22:30:00Z'))).toEqual({from:'2026-10-19',to:'2026-10-26'});
 });
 it('serves nonzero canonical KPIs and daily trends without legacy views',async()=>{
  const kpis=await (await analytics(event('/api/analytics'))).json();
  expect(kpis.data.orders).toMatchObject({total:2,active:1,completedToday:1});
  const trends=await (await analytics(event('/api/analytics?type=trends&period=7'))).json();
  expect(trends.data.total).toHaveLength(7);
  expect(trends.data.total[6]).toBe(2);
 });
 it('returns the exact statistics and station workload shape rendered by the analytics page',async()=>{
  const result=await (await overview(event('/api/orders/analytics'))).json();
  expect(result.statistics).toMatchObject({total_orders:2,active_orders:1,completed_orders:1});
  expect(result.station_workload.CNC.find((row:any)=>row.status==='IN_PROGRESS')).toEqual({status:'IN_PROGRESS',count:1});
  expect(result.orders_at_risk).toHaveLength(1);
 });
 it('returns logistics aggregates and unavailable capacity explicitly',async()=>{
  const result=await (await logistics(event('/api/logistics/metrics'))).json();
  expect(result).toMatchObject({pending_dispatch:0,scheduled_today:0,overdue:1,loading_capacity_pct:null});
 });
 it('rejects bad periods and fails visibly when data cannot be read',async()=>{
  for(const [e,status] of [[event('/api/analytics?period=-5'),400],[event('/api/analytics',true),503]] as any[]) {
   let result; try {await analytics(e);}catch(error:any){result=error.status;}
   expect(result).toBe(status);
  }
 });
});
