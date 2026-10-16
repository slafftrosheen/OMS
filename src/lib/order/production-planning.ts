/** Read-only workload estimates for each canonical station stage. No capacity promises. */
import {ALL_STATIONS} from './workflow';
import {priorityRank} from './operator-ui';
export type OrderRow={id:string;po_number?:string|null;client?:string|null;title?:string|null;
  due_date?:string|null;priority?:string|number|null;status:string};
export type StageRow={draft_order_id:string;station:string;state:string;
  estimated_hours?:number|string|null;actual_hours?:number|string|null;
  blocked_reason?:string|null;updated_at?:string|null;completed_at?:string|null;
  consumption_skipped?:boolean|null;consumption_skipped_reason?:string|null};
export type Risk='blocked'|'rework'|'overdue'|'dueSoon'|'onHold'|null;
export type PlanningItem={id:string;station:string;poNumber:string|null;client:string;title:string;
  dueDate:string|null;priority:string|number|null;status:string;stageState:string;
  upcoming:boolean;paused:boolean;risk:Risk;estimatedHours:number|null;
  actualHours:number|null;blockedReason:string|null};
export type StationSummary={active:number;queued:number;inProgress:number;blocked:number;
  rework:number;upcoming:number;paused:number;overdue:number;dueSoon:number;
  knownHours:number;missingEstimates:number;pressure:'blocked'|'atRisk'|'backlog'|'normal'};
export type PlanningTotals={orders:number;activeAssignments:number;queued:number;
  inProgress:number;blocked:number;rework:number;upcoming:number;paused:number;
  overdue:number;dueSoon:number;knownHours:number;missingEstimates:number};
const activeStates=new Set(['QUEUED','IN_PROGRESS','BLOCKED','REWORK']);
const activeOrders=new Set(['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD']);
function numeric(value:unknown):number|null {
 if(value===null||value===undefined||value==='')return null;
 const n=typeof value==='number'?value:typeof value==='string'?Number(value):NaN;
 return Number.isFinite(n)&&n>=0?n:null;
}
export function dueInDays(value:string|null|undefined,today:string):number|null {
 const parse=(text:string)=>{
   if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
   const [y,m,d]=text.split('-').map(Number),time=Date.UTC(y,m-1,d);
   return new Date(time).toISOString().slice(0,10)===text?time:null;
 };
 const due=value?parse(value.slice(0,10)):null,now=parse(today);
 return due===null||now===null?null:Math.round((due-now)/86400000);
}
const weight:Record<Exclude<Risk,null>,number>={blocked:0,rework:1,overdue:2,dueSoon:3,onHold:4};
function compare(a:PlanningItem,b:PlanningItem) {
 if(a.upcoming!==b.upcoming)return a.upcoming?1:-1;
 const ra=a.risk===null?5:weight[a.risk],rb=b.risk===null?5:weight[b.risk];
 if(ra!==rb)return ra-rb;
 const rank=priorityRank(a.priority)-priorityRank(b.priority);
 return rank||(a.dueDate??'9999-12-31').localeCompare(b.dueDate??'9999-12-31')||
  (a.poNumber??a.id).localeCompare(b.poNumber??b.id);
}
export function deriveProductionPlanning(orders:OrderRow[],stages:StageRow[],today:string){
 const byId=new Map(orders.filter(o=>activeOrders.has(o.status)).map(o=>[o.id,o]));
 const stations={} as Record<string,PlanningItem[]>;
 const workload={} as Record<string,StationSummary>;
 for(const station of ALL_STATIONS){
   stations[station]=[];
   workload[station]={active:0,queued:0,inProgress:0,blocked:0,rework:0,
    upcoming:0,paused:0,overdue:0,dueSoon:0,knownHours:0,missingEstimates:0,
    pressure:'normal'};
 }
 const totals:PlanningTotals={orders:0,activeAssignments:0,queued:0,inProgress:0,blocked:0,
  rework:0,upcoming:0,paused:0,overdue:0,dueSoon:0,knownHours:0,missingEstimates:0};
 const distinct=new Set<string>();
 for(const s of stages){
   const o=byId.get(s.draft_order_id);
   if(!o||!ALL_STATIONS.includes(s.station)||
      (s.state!=='NOT_STARTED'&&!activeStates.has(s.state)))continue;
   const upcoming=s.state==='NOT_STARTED', paused=o.status==='ON_HOLD';
   const due=dueInDays(o.due_date,today),hours=numeric(s.estimated_hours);
   const risk:Risk=paused?'onHold':s.state==='BLOCKED'?'blocked':
     s.state==='REWORK'?'rework':
     !upcoming&&due!==null&&due<0?'overdue':
     !upcoming&&due!==null&&due<=3?'dueSoon':null;
   const row:PlanningItem={id:o.id,station:s.station,poNumber:o.po_number??null,
    client:o.client??'',title:o.title??'',dueDate:o.due_date??null,
    priority:o.priority??null,status:o.status,stageState:s.state,upcoming,paused,risk,
    estimatedHours:hours,actualHours:numeric(s.actual_hours),
    blockedReason:s.blocked_reason??null};
   stations[s.station].push(row);
   distinct.add(o.id);
   const metric=workload[s.station];
   if(upcoming){metric.upcoming++;totals.upcoming++;continue;}
   metric.active++;totals.activeAssignments++;
   if(s.state==='QUEUED'){metric.queued++;totals.queued++;}
   if(s.state==='IN_PROGRESS'){metric.inProgress++;totals.inProgress++;}
   if(s.state==='BLOCKED'){metric.blocked++;totals.blocked++;}
   if(s.state==='REWORK'){metric.rework++;totals.rework++;}
   if(paused){metric.paused++;totals.paused++;}
   if(!paused&&due!==null&&due<0){metric.overdue++;totals.overdue++;}
   else if(!paused&&due!==null&&due<=3){metric.dueSoon++;totals.dueSoon++;}
   if(hours===null){metric.missingEstimates++;totals.missingEstimates++;}
   else{metric.knownHours+=hours;totals.knownHours+=hours;}
 }
 const alerts:PlanningItem[]=[];
 for(const station of ALL_STATIONS){
   stations[station].sort(compare);
   const m=workload[station];
   m.knownHours=Math.round(m.knownHours*100)/100;
   m.pressure=m.blocked+m.rework>0?'blocked':m.overdue>0?'atRisk':
     m.queued>=5?'backlog':'normal';
   alerts.push(...stations[station].filter(x=>!x.upcoming&&x.risk!==null));
 }
 totals.orders=distinct.size;
 totals.knownHours=Math.round(totals.knownHours*100)/100;
 alerts.sort(compare);
 return {stations,workload,totals,alerts:alerts.slice(0,40)};
}
