/** Pure deterministic what-if forecast. Never updates a production stage. */
import {ALL_STATIONS} from './workflow';
import type {PlanningItem} from './production-planning';
import {dailyStationHours,type ProductionCapacity} from './production-capacity';

export type ForecastReason='unconfigured'|'blocked'|'paused'|'missingEstimate'|
  'noAvailability'|'outsideHorizon';
export type UnplannedStage={id:string;station:string;poNumber:string|null;
  reason:ForecastReason;remainingHours:number|null};
export type ForecastSlice={id:string;station:string;poNumber:string|null;
  date:string;hours:number;tentative:boolean};
export type ApprovedReservationHours={
  id:string;draft_order_id:string;station:string;work_date:string;hours:number
};
export type ForecastDay={date:string;capacityHours:number;committedHours:number;
  freeHours:number;overbookedHours:number;allocatedHours:number;
  tasks:ForecastSlice[]};
export type ForecastStation={station:string;configured:boolean;dailyHours:number|null;
  days:ForecastDay[];unplanned:UnplannedStage[];late:ForecastSlice[];
  totalAvailableHours:number;totalCommittedHours:number;totalFreeHours:number;
  totalAllocatedHours:number};
export type ForecastResult={stations:Record<string,ForecastStation>;
  allocatedHours:number;availableHours:number;committedHours:number;freeHours:number;
  overbookedDays:number;unplanned:number;late:number;
  configuredStations:number;tentative:number;startDate:string;horizonDays:number};

function dates(start:string,length:number):string[]{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start))throw new Error('Invalid start date');
  const [y,m,d]=start.split('-').map(Number);
  const first=Date.UTC(y,m-1,d);
  if(new Date(first).toISOString().slice(0,10)!==start)throw new Error('Invalid start date');
  return Array.from({length},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10));
}
function weekday(iso:string):number {
  const day=new Date(iso+'T12:00:00Z').getUTCDay();
  return day===0?7:day;
}
const round=(value:number)=>Math.round(value*100)/100;
export function buildCapacityForecast(
  source:Record<string,PlanningItem[]>,capacity:ProductionCapacity[],
  startDate:string,horizonDays:7|14|28=14,includeUpcoming=false,
  commitments:ApprovedReservationHours[]=[]
):ForecastResult {
  if(![7,14,28].includes(horizonDays))throw new Error('Invalid forecast horizon');
  const calendar=dates(startDate,horizonDays);
  const byStation=new Map(capacity.map(c=>[c.station,c]));
  const dayBooked=new Map<string,number>();
  const stageBooked=new Map<string,number>();
  for(const item of commitments){
    const hours=Number(item.hours);
    if(!Number.isFinite(hours)||hours<=0)throw new Error('Invalid approved reservation hours');
    const dayKey=`${item.station}:${item.work_date}`;
    const stageKey=`${item.draft_order_id}:${item.station}`;
    dayBooked.set(dayKey,Math.round(((dayBooked.get(dayKey)??0)+hours)*100)/100);
    stageBooked.set(stageKey,Math.round(((stageBooked.get(stageKey)??0)+hours)*100)/100);
  }
  const stations={} as Record<string,ForecastStation>;
  let allocatedHours=0,availableHours=0,committedHours=0,freeHours=0,
    overbookedDays=0,unplanned=0,late=0,configuredStations=0,tentative=0;
  for(const station of ALL_STATIONS){
    const config=byStation.get(station),hours=dailyStationHours(config);
    if(config)configuredStations++;
    const days:ForecastDay[]=calendar.map(date=>{
      const capacityHours=config&&config.workdays.includes(weekday(date))?hours??0:0;
      const committedHours=dayBooked.get(`${station}:${date}`)??0;
      const freeHours=Math.max(0,round(capacityHours-committedHours));
      const overbookedHours=Math.max(0,round(committedHours-capacityHours));
      if(overbookedHours>0)overbookedDays++;
      return {date,capacityHours,committedHours,freeHours,overbookedHours,
        allocatedHours:0,tasks:[]};
    });
    const failed:UnplannedStage[]=[],lateTasks:ForecastSlice[]=[];
    const eligible=(source[station]??[]).filter(s=>!s.upcoming||includeUpcoming);
    for(const task of eligible){
      const estimate=task.estimatedHours;
      const alreadyApproved=stageBooked.get(`${task.id}:${station}`)??0;
      let reason:ForecastReason|null=task.paused?'paused':
        ['BLOCKED','REWORK'].includes(task.stageState)?'blocked':
        estimate===null||estimate<=0?'missingEstimate':
        !config?'unconfigured':
        hours===0||!config.workdays.length?'noAvailability':null;
      // R20 lists active work in dispatch order and upcoming after it.
      if(reason) {
        failed.push({id:task.id,station,poNumber:task.poNumber,
          reason,remainingHours:estimate});continue;
      }
      // Existing APPROVED stage hours, including outside this horizon,
      // are not proposed a second time.
      let remaining=round(Math.max(0,(estimate as number)-alreadyApproved));
      let lastDate:string|null=null;
      for(const day of days){
        if(remaining<=0.000001)break;
        const spare=round(day.freeHours-day.allocatedHours);
        if(spare<=0)continue;
        const allotted=round(Math.min(remaining,spare));
        if(allotted<=0)continue;
        const slice:ForecastSlice={id:task.id,station,poNumber:task.poNumber,
          date:day.date,hours:allotted,tentative:task.upcoming};
        day.tasks.push(slice);day.allocatedHours=round(day.allocatedHours+allotted);
        allocatedHours=round(allocatedHours+allotted);
        if(task.upcoming)tentative++;
        remaining=round(remaining-allotted);
        lastDate=day.date;
        if(task.dueDate && day.date>task.dueDate.slice(0,10)) {
          lateTasks.push(slice);late++;
        }
      }
      if(remaining>0.000001){
        failed.push({id:task.id,station,poNumber:task.poNumber,
          reason:'outsideHorizon',remainingHours:remaining});
      }else if(lastDate&&task.dueDate&&lastDate>task.dueDate.slice(0,10)&&
        !lateTasks.some(item=>item.id===task.id)) {
        // Safeguard if due date comparison changes elsewhere.
        lateTasks.push({id:task.id,station,poNumber:task.poNumber,
          date:lastDate,hours:0,tentative:task.upcoming});
      }
    }
    const totalAvailableHours=round(days.reduce((sum,d)=>sum+d.capacityHours,0));
    const totalCommittedHours=round(days.reduce((sum,d)=>sum+d.committedHours,0));
    const totalFreeHours=round(days.reduce((sum,d)=>sum+d.freeHours,0));
    const totalAllocatedHours=round(days.reduce((sum,d)=>sum+d.allocatedHours,0));
    availableHours=round(availableHours+totalAvailableHours);
    committedHours=round(committedHours+totalCommittedHours);
    freeHours=round(freeHours+totalFreeHours);
    unplanned+=failed.length;
    stations[station]={station,configured:!!config,dailyHours:hours,
      days,unplanned:failed,late:lateTasks,totalAvailableHours,
      totalCommittedHours,totalFreeHours,totalAllocatedHours};
  }
  return {stations,allocatedHours,availableHours,committedHours,freeHours,
    overbookedDays,unplanned,late,configuredStations,
    tentative,startDate,horizonDays};
}
