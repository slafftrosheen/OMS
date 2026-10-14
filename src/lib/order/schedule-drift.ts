/** Read-only scheduling reconciliation. This never auto-cancels a booking. */
import {ALL_STATIONS} from './workflow';
import type {PlanningItem} from './production-planning';
import type {ProductionCapacity} from './production-capacity';
import type {ApprovedReservationHours} from './capacity-forecast';
import {dailyStationHours} from './production-capacity';

export type ScheduleDriftReason=
  | 'pastCommitment'|'blockedCommitment'|'pausedCommitment'|'stageUnavailable'
  | 'notQueued'|'estimateExceeded'|'capacityExceeded'|'actualOverEstimate';
export type ScheduleDrift={
  key:string;reason:ScheduleDriftReason;station:string;orderId:string|null;
  date:string|null;hours:number;severity:'warning'|'critical'
};
const round=(n:number)=>Math.round(n*100)/100;
export function reconcileProductionSchedule(
 source:Record<string,PlanningItem[]>,
 capacity:ProductionCapacity[],
 commitments:ApprovedReservationHours[],
 today:string
):ScheduleDrift[] {
 const byStage=new Map<string,PlanningItem>();
 for(const station of ALL_STATIONS) {
  for(const item of source[station]??[]){
   byStage.set(`${item.id}:${station}`,item);
  }
 }
 const byCapacity=new Map(capacity.map(c=>[c.station,c]));
 const stageTotals=new Map<string,number>();
 const dayTotals=new Map<string,number>();
 const result:ScheduleDrift[]=[];
 const append=(reason:ScheduleDriftReason,station:string,orderId:string|null,
   date:string|null,hours:number,severity:'warning'|'critical'='warning')=>{
    result.push({key:`${reason}:${station}:${orderId??'-'}:${date??'-'}`,
      reason,station,orderId,date,hours:round(hours),severity});
 };
 for(const item of commitments){
  const hours=Number(item.hours);
  if(!Number.isFinite(hours)||hours<=0)continue;
  const stageKey=`${item.draft_order_id}:${item.station}`;
  const dateKey=`${item.station}:${item.work_date}`;
  stageTotals.set(stageKey,round((stageTotals.get(stageKey)??0)+hours));
  dayTotals.set(dateKey,round((dayTotals.get(dateKey)??0)+hours));
  const stage=byStage.get(stageKey);
  // A completed stage is absent from R20; past completed bookings remain history.
  if(!stage){
    if(item.work_date>=today)
      append('stageUnavailable',item.station,item.draft_order_id,item.work_date,hours,'critical');
    continue;
  }
  if(stage.paused)append('pausedCommitment',item.station,item.draft_order_id,item.work_date,hours,'critical');
  else if(['BLOCKED','REWORK'].includes(stage.stageState))
    append('blockedCommitment',item.station,item.draft_order_id,item.work_date,hours,'critical');
  else if(!['QUEUED','IN_PROGRESS'].includes(stage.stageState))
    append('notQueued',item.station,item.draft_order_id,item.work_date,hours);
  if(item.work_date<today)
    append('pastCommitment',item.station,item.draft_order_id,item.work_date,hours);
 }
 for(const [key,booked] of stageTotals){
  const stage=byStage.get(key);
  if(!stage)continue;
  if(stage.estimatedHours!==null && booked>stage.estimatedHours+0.001)
    append('estimateExceeded',stage.station,stage.id,null,booked-stage.estimatedHours,'critical');
  if(stage.actualHours!==null && stage.estimatedHours!==null &&
     stage.actualHours>stage.estimatedHours+0.001)
    append('actualOverEstimate',stage.station,stage.id,null,
      stage.actualHours-stage.estimatedHours);
 }
 for(const [key,hours] of dayTotals){
  const separator=key.indexOf(':');
  const station=key.slice(0,separator),date=key.slice(separator+1);
  if(date<today)continue;
  const conf=byCapacity.get(station);
  const available=conf && conf.workdays.includes(
    (new Date(date+'T12:00:00Z').getUTCDay()||7))?dailyStationHours(conf)??0:0;
  if(hours>available+0.001)
    append('capacityExceeded',station,null,date,hours-available,'critical');
 }
 const severity=(d:ScheduleDrift)=>d.severity==='critical'?0:1;
 return result.sort((a,b)=>severity(a)-severity(b)||
   (a.date??'').localeCompare(b.date??'')||
   a.station.localeCompare(b.station)||a.key.localeCompare(b.key));
}
