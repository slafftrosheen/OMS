/** OMS-R24: actual hours, estimates, and operator-reported progress are distinct. */
import {ALL_STATIONS} from './workflow';
export type PerformanceOrder={id:string;po_number?:string|null;title?:string|null;
  client?:string|null;due_date?:string|null;status:string};
export type PerformanceStage={draft_order_id:string;station:string;state:string;
  estimated_hours?:number|string|null;actual_hours?:number|string|null;
  started_at?:string|null;completed_at?:string|null;blocked_reason?:string|null};
export type ProgressObservation={station:string;orderId:string;createdAt:string;
  progressPercent:number|null;note:string};
export type PerformanceLine={orderId:string;station:string;poNumber:string|null;title:string;
  state:string;estimatedHours:number|null;actualHours:number|null;
  varianceHours:number|null;progressPercent:number|null;progressAt:string|null;
  progressNote:string|null;startedAt:string|null;completedAt:string|null;
  blockedReason:string|null};
export type PerformanceTotals={completed:number;completedWithActual:number;
  completedMissingActual:number;completedComparable:number;
  completedEstimatedHours:number;completedActualHours:number;
  completedMatchedActualHours:number;completedVarianceHours:number;overEstimate:number;
  active:number;activeWithActual:number;activeReportedProgress:number;
  activeHoursOverEstimate:number};
export type PerformanceStation={station:string;completed:number;missingActual:number;
  comparable:number;estimatedHours:number;actualHours:number;varianceHours:number;
  active:number;activeReportedProgress:number;overEstimate:number};
export type PerformanceSummary={totals:PerformanceTotals;stations:PerformanceStation[];
  completed:PerformanceLine[];active:PerformanceLine[];asOf:string;days:number};
const rounded=(n:number)=>Math.round(n*100)/100;
function hours(value:unknown):number|null{
 if(value===null||value===undefined||value==='')return null;
 const n=typeof value==='number'?value:typeof value==='string'?Number(value):NaN;
 return Number.isFinite(n)&&n>=0?rounded(n):null;
}
export function computeProductionPerformance(
 orders:PerformanceOrder[],stages:PerformanceStage[],
 progress:ProgressObservation[],asOf:string,days:number
):PerformanceSummary{
 const byOrder=new Map(orders.map(order=>[order.id,order]));
 const latest=new Map<string,ProgressObservation>();
 const dateCutoff=new Date(Date.parse(asOf)-days*86400000).toISOString();
 for(const observation of progress){
   const key=`${observation.orderId}:${observation.station}`;
   const prior=latest.get(key);
   if(!prior||observation.createdAt>prior.createdAt) latest.set(key,observation);
 }
 const totals:PerformanceTotals={completed:0,completedWithActual:0,
   completedMissingActual:0,completedComparable:0,
   completedEstimatedHours:0,completedActualHours:0,
   completedMatchedActualHours:0,completedVarianceHours:0,
   overEstimate:0,active:0,activeWithActual:0,activeReportedProgress:0,
   activeHoursOverEstimate:0};
 const perStation=new Map(ALL_STATIONS.map(station=>[station,{
   station,completed:0,missingActual:0,comparable:0,
   estimatedHours:0,actualHours:0,varianceHours:0,
   active:0,activeReportedProgress:0,overEstimate:0
 } as PerformanceStation]));
 const completed:PerformanceLine[]=[],active:PerformanceLine[]=[];
 const seen=new Set<string>();
 for(const stage of stages){
   const order=byOrder.get(stage.draft_order_id);
   if(!order||!ALL_STATIONS.includes(stage.station))continue;
   const key=`${order.id}:${stage.station}`;
   if(seen.has(key))throw new Error('Duplicate stage in performance snapshot');
   seen.add(key);
   const completedInWindow=stage.state==='COMPLETED'&&
     !!stage.completed_at&&stage.completed_at>=dateCutoff&&stage.completed_at<=asOf;
   const isActive=['QUEUED','IN_PROGRESS','BLOCKED','REWORK'].includes(stage.state)&&
     ['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(order.status);
   if(!completedInWindow&&!isActive)continue;
   const estimate=hours(stage.estimated_hours),actual=hours(stage.actual_hours);
   const report=latest.get(key);
   const percent=report?.progressPercent??null;
   const line:PerformanceLine={orderId:order.id,station:stage.station,
     poNumber:order.po_number??null,title:order.title??'',
     state:stage.state,estimatedHours:estimate,actualHours:actual,
     varianceHours:estimate!==null&&actual!==null?rounded(actual-estimate):null,
     progressPercent:percent,progressAt:report?.createdAt??null,
     progressNote:report?.note??null,startedAt:stage.started_at??null,
     completedAt:stage.completed_at??null,blockedReason:stage.blocked_reason??null};
   const metric=perStation.get(stage.station)!;
   if(completedInWindow){
     completed.push(line);totals.completed++;metric.completed++;
     if(actual===null){totals.completedMissingActual++;metric.missingActual++;}
     else{totals.completedWithActual++;totals.completedActualHours+=actual;}
     if(line.varianceHours!==null){
       totals.completedComparable++;metric.comparable++;
       totals.completedEstimatedHours+=estimate!;
       totals.completedMatchedActualHours+=actual!;
       totals.completedVarianceHours+=line.varianceHours;
       metric.estimatedHours+=estimate!;metric.actualHours+=actual!;
       metric.varianceHours+=line.varianceHours;
       if(line.varianceHours>0){totals.overEstimate++;metric.overEstimate++;}
     }
   }else{
     active.push(line);totals.active++;metric.active++;
     if(actual!==null)totals.activeWithActual++;
     if(percent!==null){totals.activeReportedProgress++;metric.activeReportedProgress++;}
     if(line.varianceHours!==null&&line.varianceHours>0)totals.activeHoursOverEstimate++;
   }
 }
 for(const field of ['completedEstimatedHours','completedActualHours',
   'completedMatchedActualHours','completedVarianceHours'] as const)
   totals[field]=rounded(totals[field]);
 for(const item of perStation.values()){
   item.estimatedHours=rounded(item.estimatedHours);
   item.actualHours=rounded(item.actualHours);
   item.varianceHours=rounded(item.varianceHours);
 }
 completed.sort((a,b)=>(b.completedAt??'').localeCompare(a.completedAt??'')||
   a.station.localeCompare(b.station)||a.orderId.localeCompare(b.orderId));
 active.sort((a,b)=>{
   const av=a.varianceHours,bv=b.varianceHours;
   if(av===null&&bv!==null)return 1;
   if(bv===null&&av!==null)return -1;
   if(av!==null&&bv!==null&&av!==bv)return bv-av;
   return a.station.localeCompare(b.station)||a.orderId.localeCompare(b.orderId);
 });
 return {totals,stations:[...perStation.values()],completed,active,asOf,days};
}
