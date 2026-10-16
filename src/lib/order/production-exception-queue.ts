/** OMS-R25: deterministic live exception suggestions; no persisted status here. */
import type {PerformanceSummary,PerformanceLine} from './production-performance';
import type {ApprovedReservationHours} from './capacity-forecast';
import type {ReviewKind,ExceptionReview} from './production-exceptions';
import type {ProductionOversight} from './production-oversight';
export type ProductionFinding={
  key:string;orderId:string;station:string;kind:ReviewKind;
  poNumber:string|null;title:string;
  hours:number|null;referenceDate:string|null;
  severity:'critical'|'warning';details:string;sourceNote?:string|null;
};
export type ReviewQueueItem=ProductionFinding&{
  review:ExceptionReview|null;sourceActive:boolean;
  sourceCoverageUnknown?:boolean;
};
export const issueKey=(orderId:string,station:string,kind:ReviewKind)=>
  `${orderId}:${station}:${kind}`;
function finding(line:PerformanceLine,kind:ReviewKind,
  severity:'critical'|'warning',hours:number|null,
  referenceDate:string|null,details:string):ProductionFinding{
  return {key:issueKey(line.orderId,line.station,kind),orderId:line.orderId,
    station:line.station,kind,poNumber:line.poNumber,title:line.title,
    hours,referenceDate,severity,details};
}
export function detectProductionExceptions(
  summary:PerformanceSummary,
  commitments:ApprovedReservationHours[]|null,
  today:string
):ProductionFinding[]{
  const output=new Map<string,ProductionFinding>();
  for(const line of summary.completed){
    if(line.actualHours===null){
      const item=finding(line,'MISSING_ACTUAL','warning',
        line.estimatedHours,line.completedAt,'completedWithoutRecordedHours');
      output.set(item.key,item);
    }
  }
  for(const line of [...summary.completed,...summary.active]){
    if(line.varianceHours!==null&&line.varianceHours>0){
      const item=finding(line,'ACTUAL_OVERRUN','warning',
        line.varianceHours,line.completedAt,'measuredHoursOverEstimate');
      output.set(item.key,item);
    }
  }
  const active=new Map<string,PerformanceLine>();
  for(const line of summary.active){
    active.set(`${line.orderId}:${line.station}`,line);
    if(line.state==='BLOCKED'||line.state==='REWORK'){
      const kind:ReviewKind=line.state;
      const item=finding(line,kind,'critical',null,
        line.progressAt,'activeProductionInterruption');
      output.set(item.key,item);
    }
  }
  if(commitments!==null){
    for(const record of commitments){
      if(record.work_date>=today)continue;
      const line=active.get(`${record.draft_order_id}:${record.station}`);
      if(!line)continue;
      const item=finding(line,'MISSED_BOOKING','critical',
        Number(record.hours),record.work_date,'approvedDatePassedWhileStageActive');
      const previous=output.get(item.key);
      if(previous){
        item.hours=Math.round(((previous.hours??0)+(item.hours??0))*100)/100;
        if(previous.referenceDate!==null&&previous.referenceDate>record.work_date)
          item.referenceDate=previous.referenceDate;
      }
      output.set(item.key,item);
    }
  }
  return [...output.values()].sort((a,b)=>
    (a.severity===b.severity?0:a.severity==='critical'?-1:1)||
    (a.referenceDate??'9999').localeCompare(b.referenceDate??'9999')||
    a.station.localeCompare(b.station)||a.key.localeCompare(b.key));
}
/** Convert the R39 bounded, management-only read model into R25 review
 * findings. No claim is persisted here: the R40 SQL RPC independently checks
 * canonical stage state on claim and reopen.
 */
export function oversightProductionFindings(
  source:ProductionOversight
):ProductionFinding[]{
  return source.signals.map(signal=>({
    key:issueKey(signal.orderId,signal.station,signal.kind),
    orderId:signal.orderId,station:signal.station,
    kind:signal.kind,poNumber:signal.poNumber,title:signal.title,
    hours:signal.kind==='STAGE_UNCHANGED'?signal.elapsedHours:null,
    referenceDate:signal.recordedAt.slice(0,10),
    severity:'warning' as const,
    details:signal.kind==='STAGE_UNCHANGED'
      ?'stageRecordUnchanged':'materialSkipForReview',
    sourceNote:signal.kind==='MATERIAL_SKIPPED'?signal.reason:null
  }));
}
export function mergeProductionReviews(
  findings:ProductionFinding[],reviews:ExceptionReview[]
):ReviewQueueItem[]{
  const matches=new Map(reviews.map(r=>[issueKey(r.draft_order_id,r.station,r.kind),r]));
  const active=new Set(findings.map(f=>f.key));
  const live=findings.map(f=>({...f,review:matches.get(f.key)??null,sourceActive:true}));
  const historical=reviews.filter(r=>!active.has(issueKey(r.draft_order_id,r.station,r.kind)))
    .map(r=>({key:issueKey(r.draft_order_id,r.station,r.kind),
      orderId:r.draft_order_id,station:r.station,kind:r.kind,poNumber:null,title:'',
      hours:null,referenceDate:null,severity:'warning' as const,
      details:'conditionNotCurrentlyReported',
      review:r,sourceActive:false
    }));
  return [...live,...historical].sort((a,b)=>{
    if(a.sourceActive!==b.sourceActive)return a.sourceActive?-1:1;
    if(a.review?.status==='RESOLVED'&&b.review?.status!=='RESOLVED')return 1;
    if(b.review?.status==='RESOLVED'&&a.review?.status!=='RESOLVED')return -1;
    if(a.review===null&&b.review!==null)return -1;
    if(b.review===null&&a.review!==null)return 1;
    return (a.severity===b.severity?0:a.severity==='critical'?-1:1)||
      (a.review?.due_date??'9999').localeCompare(b.review?.due_date??'9999')||
      a.key.localeCompare(b.key);
  });
}
